# Test harness: serves a bundle of the content scripts so they can be injected into a real YouTube tab
# without loading the unpacked extension (the code runs in the page world, with chrome.* absent).
import http.server, os, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        css = open(os.path.join(root, "src/content.css")).read()
        js = "".join(open(os.path.join(root, f)).read() + "\n" for f in ["src/page.js", "src/captions.js", "src/content.js"])
        body = ("(()=>{const s=document.createElement('style');s.textContent=%r;document.head.append(s);})();\n" % css) + js
        b = body.encode()
        self.send_response(200); self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        # Saves a caption file posted from the test tab as a test fixture: POST /fixture/<name>.json
        name = os.path.basename(self.path)
        n = int(self.headers.get("Content-Length", 0))
        os.makedirs(os.path.join(root, "test/fixtures"), exist_ok=True)
        open(os.path.join(root, "test/fixtures", name), "wb").write(self.rfile.read(n))
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Private-Network", "true"); self.send_header("Access-Control-Allow-Headers", "*"); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8791), H).serve_forever()
