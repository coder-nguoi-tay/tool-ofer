/**
 * Chọn đáp án theo nghĩa cho câu §17 từ danh sách nhãn option (đã lọc qua optionScorer).
 *
 * @param {string} qType Loại câu hỏi ('age_range' | 'preference' | 'vehicle').
 * @param {string[]} labels Nhãn option (lowercase), theo thứ tự DOM.
 * @param {object} [rec={}] Bản ghi lead.
 * @param {number|null} [age=null] Tuổi đã tính từ record.
 * @return {{index: number, confidence: 'record'|'block_score'|'first_answer'}|null} Vị trí option được chọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function chooseSemanticAnswer(qType, labels = [], rec = {}, age = null) {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const find = fn => labels.findIndex(fn);
  const byWant = want => want ? find(l => l.includes(want) || want.split(' ').some(w => w.length > 2 && l.includes(w))) : -1;
  const byPriority = (list, extra = () => true) => {
    for (const kw of list) {
      const i = find(l => (kw instanceof RegExp ? kw.test(l) : l.includes(kw)) && extra(l));
      if (i >= 0) return i;
    }
    return -1;
  };
  let i = -1;
  if (qType === 'age_range') {
    if (age > 10 && age < 100) {
      i = find(l => {
        const m = l.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/);
        if (m) return age >= Number(m[1]) && age <= Number(m[2]);
        const plus = l.match(/(\d{2})\s*(?:\+|and over|or older|and older|plus)/) || l.match(/over\s*(\d{2})/);
        if (plus) return age >= Number(plus[1]);
        if (/under 18|18 & under/.test(l)) return age < 18;
        return false;
      });
      if (i >= 0) return {
        index: i,
        confidence: 'record'
      };
    }
    // Mức phổ biến trong survey: trung bình trước, già cao nhất cuối
    i = byPriority([/25[-– ]34/, /35[-– ]44/, /45[-– ]54/, /18[-– ]24/, /55[-– ]64/, /65\+|over 65/]);
  } else if (qType === 'preference') {
    i = byWant(norm(rec.favorite_vehicle || rec.vehicle_preference || rec.favorite || rec.vehicle_type));
    if (i >= 0) return {
      index: i,
      confidence: 'record'
    };
    i = byPriority(['suv', 'sedan', 'truck', 'car', 'motorcycle', 'van', 'bus']);
  } else if (qType === 'vehicle') {
    i = byWant(norm(rec.vehicle_type || rec.vehicle_make || rec.car_make || rec.vehicle_model));
    if (i >= 0) return {
      index: i,
      confidence: 'record'
    };
    // §17.5 ví dụ 3: hiện tại drives không rõ → ưu tiên Car; tránh "I do not drive"
    i = byPriority(['car', 'suv', 'sedan', 'truck', 'motorcycle', 'van', 'bus'], l => !/drive|do not|don.t/.test(l));
  }
  if (i >= 0) return {
    index: i,
    confidence: 'block_score'
  };
  // User chỉ rõ: chọn đáp án ĐẦU TIÊN làm fallback thay vì bỏ qua (tránh điểm chết dừng survey).
  // Vẫn né "None of the Above"/"Skip"/"I do not drive" nếu có lựa chọn khác đi trước.
  i = find(l => !/none of the above|none of above|skip|prefer not|do not drive|don.t drive|not currently/.test(l));
  return i >= 0 ? {
    index: i,
    confidence: 'first_answer'
  } : null;
}
export { chooseSemanticAnswer };
