import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const BIN_NAMES = { win: "ton-proxy.exe", linux: "ton-proxy" };

export const TonProxy = {
  _process: null,
  _filter: null,

  async init() {
    try {
      const prefs = Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefBranch);

      if (!prefs.getBoolPref("network.tonproxy.enabled", false)) {
        return;
      }

      const host = prefs.getCharPref("network.tonproxy.host", "127.0.0.1");
      const port = prefs.getIntPref("network.tonproxy.port", 6666);

      const { Subprocess } = ChromeUtils.importESModule(
        "resource://gre/modules/Subprocess.sys.mjs"
      );

      const dirsvc = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties);
      const greDir = dirsvc.get("GreD", Ci.nsIFile);

      const binName = BIN_NAMES[AppConstants.platform];
      if (!binName) {
        console.info("TonProxy: unsupported platform");
        return;
      } 
      
      const bin = greDir.clone();
      bin.append("browser");
      bin.append(binName);

      if (!bin.exists() || !bin.isExecutable()) {
        console.error("TON Proxy binary not found or not executable:", bin.path);
        return;
      }

      this._process = await Subprocess.call({
        command: bin.path,
        arguments: [
          "-addr",
          `${host}:${port}`,
        ],
        stdout: "pipe",
        stderr: "pipe",
      });

      this._process.stdout.readString().catch(() => {});
      this._process.stderr.readString().catch(() => {});

      console.log(`TON Proxy started on ${host}:${port}`);

      this._registerProxyFilter(host, port);
    } catch (e) {
      console.error("TonProxy.init failed:", e);
    }
  },

_registerProxyFilter(host, port) {
  const pps = Cc["@mozilla.org/network/protocol-proxy-service;1"]
    .getService(Ci.nsIProtocolProxyService);

  const filter = {
    applyFilter(uri, proxyInfo, callback) {
      try {
        if (uri && uri.host && uri.host.endsWith(".ton")) {
          const pi = pps.newProxyInfo(
            "http",
            host,
            port,
            "",
            "",
            0,
            0,
            null,
          );
        console.log("TonProxy: using proxy for", uri.spec, "->", host, port);
          callback.onProxyFilterResult(pi);
          return;
        }
      } catch (e) {
        console.error("TonProxy filter error:", e);
      }

      callback.onProxyFilterResult(proxyInfo);
    },
  };

  pps.registerFilter(filter, 0);
  this._filter = { pps, filter };
},

  async uninit() {
    if (this._filter) {
      try {
        this._filter.pps.unregisterFilter(this._filter.filter);
      } catch (_) {}
      this._filter = null;
    }

    if (this._process) {
      try {
        this._process.kill();
      } catch (_) {}
      this._process = null;
    }
  },
};
