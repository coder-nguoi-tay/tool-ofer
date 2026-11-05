import http from 'http';
import https from 'https';

const urls = ['https://api.ipify.org?format=json', 'https://ipinfo.io/json', 'https://api.ip.sb/jsonip'];

for (const url of urls) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(url, '->', JSON.stringify(data));
  } catch(e) {
    console.log(url, 'ERR', e.message);
  }
}
