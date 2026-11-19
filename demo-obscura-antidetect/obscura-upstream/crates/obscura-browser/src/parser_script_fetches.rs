use std::collections::{HashMap, HashSet, VecDeque};

use futures::{Stream, StreamExt};
use obscura_net::Response;
use tokio::{sync::mpsc, task::JoinSet, time::Instant};

pub(crate) struct ScriptFetchResult {
    pub index: usize,
    pub url: String,
    pub response: Result<Response, String>,
}

/// Hang tai script theo document; huy worker khi document ket thuc/bi huy.
pub(crate) struct ParserScriptFetches {
    receiver: mpsc::Receiver<ScriptFetchResult>,
    pending: HashSet<usize>,
    completed: HashMap<usize, ScriptFetchResult>,
    completion_order: VecDeque<usize>,
    _worker: JoinSet<()>,
}

impl ParserScriptFetches {
    /// Tai song song co gioi han, giu ket qua tung script thay vi cho ca lo.
    /// @param stream Luong request da gioi han so ket noi.
    /// @param indices Dinh danh script thuc su duoc phep tai.
    /// @return Hang ket qua duoc so huu boi document hien tai.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn new(stream: impl Stream<Item = ScriptFetchResult> + Send + 'static, indices: impl IntoIterator<Item = usize>) -> Self {
        let (sender, receiver) = mpsc::channel(16);
        let mut worker = JoinSet::new();
        worker.spawn(async move {
            futures::pin_mut!(stream);
            while let Some(result) = stream.next().await {
                if sender.send(result).await.is_err() { break; }
            }
        });
        Self { receiver, pending: indices.into_iter().collect(), completed: HashMap::new(), completion_order: VecDeque::new(), _worker: worker }
    }

    /// Luu script da tai xong va mo khoa script do, ke ca request that bai.
    /// @param result Ket qua request cua mot script.
    /// @return Khong co gia tri tra ve.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    fn remember(&mut self, result: ScriptFetchResult) {
        self.pending.remove(&result.index);
        self.completion_order.push_back(result.index);
        self.completed.insert(result.index, result);
    }

    /// Lay ket qua hien co ma khong cho mang, dung cho script async.
    /// @param index Dinh danh script.
    /// @return Ket qua da tai hoac None neu request chua ket thuc.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn try_take(&mut self, index: usize) -> Option<ScriptFetchResult> {
        while let Ok(result) = self.receiver.try_recv() { self.remember(result); }
        self.completed.remove(&index)
    }

    /// Chi cho script dang chan parser/defer; giu cac ket qua khac de dung sau.
    /// @param index Dinh danh script can chay tiep.
    /// @param deadline Han ket thuc tai mang cua document.
    /// @return Ket qua script can lay; None khi bi chan, het han hoac huy.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub async fn wait_for(&mut self, index: usize, deadline: Instant) -> Option<ScriptFetchResult> {
        if let Some(result) = self.try_take(index) { return Some(result); }
        while self.pending.contains(&index) {
            let result = tokio::time::timeout_at(deadline, self.receiver.recv()).await.ok().flatten()?;
            self.remember(result);
            if let Some(result) = self.completed.remove(&index) { return Some(result); }
        }
        None
    }

    /// Lay script async theo thu tu tai xong, khong bi chan boi script cham truoc no.
    /// @param deadline Han ket thuc tai mang cua document.
    /// @return Ket qua ke tiep; None khi khong con request hoac het han.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub async fn next_completed(&mut self, deadline: Instant) -> Option<ScriptFetchResult> {
        while let Some(index) = self.completion_order.pop_front() {
            if let Some(result) = self.completed.remove(&index) { return Some(result); }
        }
        let result = tokio::time::timeout_at(deadline, self.receiver.recv()).await.ok().flatten()?;
        self.pending.remove(&result.index);
        Some(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FetchLifetime(Option<tokio::sync::oneshot::Sender<()>>);

    impl Drop for FetchLifetime {
        /// Xac nhan future mang duoc giai phong khi document huy hang tai.
        /// @return Khong co gia tri tra ve.
        /// @author ductv <ductv@getflycrm.com>
        /// @since 2026-11-19
        fn drop(&mut self) {
            if let Some(sender) = self.0.take() { let _ = sender.send(()); }
        }
    }

    /// Huy document phai huy request dang cho, khong giu worker mo coi.
    /// @return Hoan tat assertion vong doi worker.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[tokio::test]
    async fn dropping_parser_fetch_queue_cancels_in_flight_work() {
        let (started, starting) = tokio::sync::oneshot::channel();
        let (dropped, dropping) = tokio::sync::oneshot::channel();
        let stream = futures::stream::once(async move {
            let _lifetime = FetchLifetime(Some(dropped));
            let _ = started.send(());
            futures::future::pending::<ScriptFetchResult>().await
        });
        let queue = ParserScriptFetches::new(stream, [0]);
        tokio::time::timeout(std::time::Duration::from_secs(1), starting).await.unwrap().unwrap();
        drop(queue);
        tokio::time::timeout(std::time::Duration::from_secs(1), dropping).await.unwrap().unwrap();
    }
}
