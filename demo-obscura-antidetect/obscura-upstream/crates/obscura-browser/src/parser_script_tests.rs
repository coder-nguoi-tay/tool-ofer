use super::{Page, BrowserContext, Arc, Url, parse_html};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Tao server script offline co request cham, HTTP loi va script thanh cong.
/// @return Origin va worker can huy sau test.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
async fn script_server() -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let worker = tokio::spawn(async move {
        let mut requests = tokio::task::JoinSet::new();
        loop {
            tokio::select! {
                accepted = listener.accept() => {
                    let Ok((mut socket, _)) = accepted else { break; };
                    requests.spawn(async move {
                        let mut request = [0u8; 4096];
                        let length = socket.read(&mut request).await.unwrap_or(0);
                        let request = String::from_utf8_lossy(&request[..length]);
                        let path = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("");
                        let (status, delay, code) = match path {
                            "/slow.js" => (200, 350, "window.order.push('slow');"),
                            "/fast.js" => (200, 10, "window.order.push('fast');var input=document.createElement('input');input.type='email';document.body.appendChild(input);"),
                            "/slow.css" => (200, 350, "input { display: none; }"),
                            "/fast.css" => (200, 5, "input { color: rgb(1, 2, 3); }"),
                            "/error.css" => (500, 0, "input { display: none; }"),
                            "/defer.js" => (200, 5, "window.order.push('defer:'+document.readyState);"),
                            "/module.js" => (200, 5, "window.order.push('module:'+String(document.currentScript===null));"),
                            "/throw.js" => (200, 0, "throw new Error('fixture script error');"),
                            _ => (404, 0, "window.badExecuted=true;"),
                        };
                        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                        let content_type = if path.ends_with(".css") { "text/css" } else { "application/javascript" };
                        let response = format!("HTTP/1.1 {status} OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{code}", code.len());
                        let _ = socket.write_all(response.as_bytes()).await;
                        let _ = socket.shutdown().await;
                    });
                }
                _ = requests.join_next(), if !requests.is_empty() => {}
            }
        }
    });
    (format!("http://{address}"), worker)
}

/// Khoi tao document script trong core, khong qua app/autofill.
/// @param origin Origin cua fixture.
/// @param html Document can kiem tra.
/// @return Page co runtime V8 va policy cho loopback.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn fixture_page(origin: &str, html: &str) -> Page {
    let context = Arc::new(BrowserContext::with_storage_and_network("parser-script-fixture".to_string(), None, false, None, None, true));
    let mut page = Page::new("parser-script-fixture".to_string(), context);
    page.url = Some(Url::parse(&format!("{origin}/index.html")).unwrap());
    page.dom = Some(parse_html(html));
    page.init_js();
    page
}

/// Script async cham khong chan parser/DCL va script async nhanh hon.
/// @return Hoan tat assertion thu tu lifecycle va khoi tao input.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn parser_async_scripts_do_not_block_inline_or_dom_content_loaded() {
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head><script>
      window.order=[];document.addEventListener('DOMContentLoaded',()=>order.push('dcl'));
      window.addEventListener('load',()=>order.push('load'));
    </script><script async src='/slow.js' onload="order.push('slow-load')"></script>
    <script async src='/fast.js' onload="order.push('fast-load')"></script>
    <script>order.push('inline');</script></head><body></body></html>"#);
    page.execute_scripts().await;
    let result = page.js.as_mut().unwrap().evaluate("({order,inputs:document.querySelectorAll('input').length,current:document.currentScript===null})").unwrap();
    assert_eq!(result, serde_json::json!({"order":["inline","dcl","fast","fast-load","slow","slow-load","load"],"inputs":1,"current":true}));
    server.abort();
}

/// Timeout cua script cham khong xoa script da tai va van con thoi gian thuc thi.
/// @return Hoan tat assertion form va loi mang duoc ghi lai.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn parser_fetch_timeout_preserves_completed_scripts_and_form() {
    std::env::set_var("OBSCURA_SCRIPT_DEADLINE_MS", "100");
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head><script>window.order=[];</script>
    <script src='/slow.js' onerror="order.push('slow-error')"></script>
    <script src='/fast.js' onload="order.push('fast-load')"></script>
    <script>order.push('after');</script></head><body></body></html>"#);
    page.execute_scripts().await;
    let result = page.js.as_mut().unwrap().evaluate("[order,document.querySelectorAll('input').length]").unwrap();
    assert_eq!(result, serde_json::json!([["slow-error","fast","fast-load","after"],1]));
    assert!(page.network_events.iter().any(|event| event.url.ends_with("/slow.js") && event.error_text.is_some()));
    assert_eq!(page.network_events.iter().filter(|event| event.url.ends_with("/fast.js")).count(), 1);
    server.abort();
}

/// Prefetch khong doi thu tu classic/defer, script defer thay readyState interactive.
/// @return Hoan tat assertion thu tu script.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn parser_classic_and_defer_preserve_document_order() {
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head><script>window.order=[];document.addEventListener('DOMContentLoaded',()=>order.push('dcl'));</script>
    <script defer src='/defer.js' onload="order.push('defer-load')"></script>
    <script src='/slow.js' onload="order.push('classic-load')"></script>
    <script>order.push('inline');</script></head><body></body></html>"#);
    page.execute_scripts().await;
    assert_eq!(page.js.as_mut().unwrap().evaluate("order").unwrap(), serde_json::json!(["slow","classic-load","inline","defer:interactive","defer-load","dcl"]));
    server.abort();
}

/// Loi HTTP phat error; loi JS van phat load va script sau van chay.
/// @return Hoan tat assertion callback va phan hoi HTTP.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn parser_script_load_and_error_callbacks_unblock_fallback() {
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head><script>window.order=[];</script>
    <script src='/missing.js' onerror="order.push('missing-error')" onload="order.push('bad-load')"></script>
    <script src='/throw.js' onload="order.push('throw-load')"></script>
    <script>order.push('after');</script></head><body></body></html>"#);
    page.execute_scripts().await;
    assert_eq!(page.js.as_mut().unwrap().evaluate("[order,window.badExecuted===undefined]").unwrap(), serde_json::json!([["missing-error","throw-load","after"],true]));
    server.abort();
}

/// DCL chi phat mot lan tren document va bubble toi window nhu trinh duyet.
/// @return Hoan tat assertion target/bubbles cua su kien.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn parser_dom_content_loaded_bubbles_once_with_document_target() {
    let mut page = fixture_page("http://example.com", r#"<html><head><script>
      window.events=[];
      document.addEventListener('DOMContentLoaded',event=>events.push(['document',event.target===document,event.bubbles]));
      window.addEventListener('DOMContentLoaded',event=>events.push(['window',event.target===document,event.bubbles]));
    </script></head><body></body></html>"#);
    page.execute_scripts().await;
    assert_eq!(page.js.as_mut().unwrap().evaluate("events").unwrap(), serde_json::json!([["document",true,true],["window",true,true]]));
}

/// CSS da tai khong mat khi sheet khac cham; body HTTP 500 khong thanh style.
/// @return Hoan tat assertion CSS thanh cong va loi qua CDP.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn stylesheet_timeout_preserves_completed_rules_and_rejects_http_errors() {
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head>
      <link rel="stylesheet" href="/slow.css"><link rel="stylesheet" href="/fast.css">
      <link rel="stylesheet" href="/error.css"></head><body><input type="email"></body></html>"#);
    let sheets = page.fetch_stylesheets_until(tokio::time::Instant::now() + std::time::Duration::from_millis(100)).await;
    assert_eq!(sheets.len(), 1);
    assert!(sheets[0].1.contains("rgb(1, 2, 3)"));
    assert!(page.network_events.iter().any(|event| event.url.ends_with("/slow.css") && event.error_text.is_some()));
    assert!(page.network_events.iter().any(|event| event.url.ends_with("/error.css") && event.status == 500));
    server.abort();
}

/// Module phat load/error de website mo khoa buoc khoi tao va fallback.
/// @return Hoan tat assertion callback cua script module.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test(flavor = "current_thread")]
async fn parser_modules_emit_load_and_error_callbacks() {
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head><script>window.order=[];</script>
      <script type="module" src="/missing.js" onerror="order.push('module-error')"></script>
      <script type="module" src="/module.js" onload="order.push('module-load')"></script>
      <script type="module" onload="order.push('inline-load')">order.push('inline-module');</script>
      </head><body></body></html>"#);
    page.execute_scripts().await;
    assert_eq!(page.js.as_mut().unwrap().evaluate("order").unwrap(), serde_json::json!(["module-error","module:true","module-load","inline-module","inline-load"]));
    server.abort();
}

/// Script parser dung cung transport cua page thay vi doi HTTP client giua chung.
/// @return Hoan tat assertion transport duoc chon dung trong build stealth.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[cfg(feature = "stealth")]
#[tokio::test(flavor = "current_thread")]
async fn parser_scripts_use_the_page_transport() {
    let (origin, server) = script_server().await;
    let mut page = fixture_page(&origin, r#"<html><head><script>window.order=[];</script>
      <script src="/fast.js"></script></head><body></body></html>"#);
    page.http_client = Arc::new(obscura_net::ObscuraHttpClient::with_full_options(
        Arc::new(obscura_net::CookieJar::new()), Some("http://127.0.0.1:9"), true));
    page.stealth_client = Some(Arc::new(obscura_net::StealthHttpClient::with_proxy(
        Arc::new(obscura_net::CookieJar::new()), None, true)));
    page.execute_scripts().await;
    assert_eq!(page.js.as_mut().unwrap().evaluate("order").unwrap(), serde_json::json!(["fast"]));
    assert!(page.network_events.iter().any(|event| event.url.ends_with("/fast.js") && event.status == 200));
    server.abort();
}
