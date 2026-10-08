import http.server
import socketserver
import webbrowser
import os

PORT = int(os.environ.get("PORT", "8787"))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    httpd = None
    for candidate in range(PORT, PORT + 20):
        try:
            httpd = socketserver.TCPServer(("", candidate), Handler)
            PORT = candidate
            break
        except OSError as exc:
            if exc.errno not in (10048, 98):
                raise
            continue

    if httpd is None:
        raise RuntimeError(f"No free port found in range {PORT}-{PORT + 19}.")

    url = f"http://localhost:{PORT}"
    print("==================================================")
    print("Meridian Solar & Logistics Platform - RUNNING")
    print(f"URL: {url}")
    print("Open the above URL in your browser.")
    print("==================================================")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()
