package com.lzwcai.plugins.ssdp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LzwcSsdp")
public class LzwcSsdpPlugin extends Plugin implements LzwcSsdp.DeviceCallback {

    private LzwcSsdp impl;

    @Override
    public void load() {
        impl = new LzwcSsdp(getContext(), this);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String nt = call.getString("ntFilter", "agentbox:device");
        Long cacheMaxAge = null;
        if (call.getData().has("cacheMaxAge")) {
            try { cacheMaxAge = call.getLong("cacheMaxAge"); } catch (Throwable ignored) {}
        }
        impl.start(nt, cacheMaxAge);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        impl.stop();
        call.resolve();
    }

    @PluginMethod
    public void getCached(PluginCall call) {
        // Native caches only lastSeen timestamps; expose an empty array for simplicity.
        JSObject ret = new JSObject();
        ret.put("devices", new JSObject[0]);
        call.resolve(ret);
    }

    @Override
    public void onDiscovered(String location, String server, String nt, String usn, String senderIp) {
        JSObject data = new JSObject();
        data.put("location", location);
        data.put("server", server);
        data.put("nt", nt);
        data.put("usn", usn);
        data.put("senderIp", senderIp);
        data.put("lastSeen", System.currentTimeMillis());
        notifyListeners("deviceDiscovered", data);
    }

    @Override
    public void onExpired(String location) {
        JSObject data = new JSObject();
        data.put("location", location);
        notifyListeners("deviceExpired", data);
    }

    @Override
    public void onError(String message) {
        JSObject data = new JSObject();
        data.put("message", message);
        notifyListeners("error", data);
    }
}


