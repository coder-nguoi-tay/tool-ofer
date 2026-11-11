// Fixture cấu trúc tương đương HTML người dùng cung cấp; không chứa dữ liệu/token/script theo dõi thật.
export const FINANCIALHELP_STEP_FIXTURE = `<!doctype html><style>
[id^=sign_up_step]{display:none;padding:12px;width:500px}#sign_up_step1{display:block}
input,select,button{display:block;margin:8px;height:30px}
</style><form id="reg-data">
<div id="sign_up_step1" class="sign_up"><select id="title_select" name="title_select"><option>Mr.</option><option>Ms.</option></select><input id="fname_input" name="fname_input" placeholder="First Name"><input id="lname_input" name="lname_input" placeholder="Last Name"><button type="button" class="sign_up_btn" onclick="nextFormWithValidation('sign_up_step2','sign_up_step1',['fname_input','lname_input'])">Start Your Search</button></div>
<div id="sign_up_step2" class="sign_up"><h2>Please provide your Date of Birth</h2><input id="dob" name="dob" type="date"><button type="button" class="sign_up_btn" onclick="nextFormWithValidation('sign_up_step3','sign_up_step2',['dob'])">Continue</button></div>
<div id="sign_up_step3" class="sign_up"><h2>Would you like updates?</h2><input type="hidden" name="question1Answer"><div class="yes_no_btns"><button type="button" class="yes" onclick="nextForm('sign_up_step5','sign_up_step3')">Yes</button><button type="button" class="no" onclick="nextForm('sign_up_step5','sign_up_step3')">No</button></div></div>
<div id="sign_up_step5" class="sign_up"><input id="address" name="address" placeholder="Address"><input id="zip_code" name="zip_code" placeholder="Zip Code"><button type="button" class="sign_up_btn" onclick="nextFormWithValidation('sign_up_step6','sign_up_step5',['address','zip_code'])">Continue</button></div>
<div id="sign_up_step6" class="sign_up"><input id="email" name="email" type="email"><input id="phone" name="phone" type="tel"><button id="sign_upbtn" type="button" class="sign_up_btn" onclick="document.getElementById('reg-data').dataset.sent='1';this.closest('.sign_up').style.display='none'">Find Your Grants</button></div>
</form><script>
/**
 * Chuyển bước giả lập bằng thay đổi hiển thị, không gửi request ra ngoài.
 * @param {string} next Bước cần hiển thị.
 * @param {string} previous Bước vừa hoàn tất.
 * @return {void} Chuyển bước theo DOM fixture.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function nextForm(next,previous){document.getElementById(previous).style.display='none';document.getElementById(next).style.display='block';}
/**
 * Kiểm tra trường được cung cấp trước khi chuyển bước fixture.
 * @param {string} next Bước tiếp theo.
 * @param {string} previous Bước hiện tại.
 * @param {string[]} fields Trường phải có giá trị.
 * @return {void} Chuyển khi dữ liệu đã nhập, giữ bước nếu thiếu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function nextFormWithValidation(next,previous,fields){if(fields.every(id=>document.getElementById(id).value))nextForm(next,previous);}
</script>`;
