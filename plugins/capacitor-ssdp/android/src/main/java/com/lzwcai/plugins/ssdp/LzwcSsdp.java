package com.lzwcai.plugins.ssdp;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class LzwcSsdp {
    private static final String TAG = "LzwcSsdp";
    private static final String SSDP_ADDR = "239.255.255.250";
    private static final int SSDP_PORT = 1900;

    private final Context context;
    private final DeviceCallback callback;
    private WifiManager.MulticastLock multicastLock;
    private HandlerThread workerThread;
    private Handler workerHandler;
    private volatile boolean running = false;
    private String ntFilter = "agentbox:device";
    private long cacheMaxAgeMs = 60_000;

    private final Map<String, Long> deviceLastSeen = new HashMap<>();

    public interface DeviceCallback {
        void onDiscovered(String location, String server, String nt, String usn, String senderIp);
        void onExpired(String location);
        void onError(String message);
    }

    public LzwcSsdp(Context context, DeviceCallback callback) {
        this.context = context.getApplicationContext();
        this.callback = callback;
    }

    public void start(String ntFilter, Long cacheMaxAgeMs) {
        if (ntFilter != null && !ntFilter.isEmpty()) this.ntFilter = ntFilter;
        if (cacheMaxAgeMs != null && cacheMaxAgeMs > 0) this.cacheMaxAgeMs = cacheMaxAgeMs;

        if (running) return;
        running = true;

        WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            multicastLock = wifi.createMulticastLock("lzwc-ssdp");
            multicastLock.setReferenceCounted(true);
            multicastLock.acquire();
        }

        workerThread = new HandlerThread("ssdp-listener");
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());

        workerHandler.post(this::listenLoop);
        workerHandler.postDelayed(this::cleanupLoop, 5_000);
    }

    public void stop() {
        running = false;
        if (workerThread != null) {
            workerThread.quitSafely();
            workerThread = null;
            workerHandler = null;
        }
        if (multicastLock != null && multicastLock.isHeld()) {
            multicastLock.release();
        }
        deviceLastSeen.clear();
    }

    private void listenLoop() {
        byte[] buf = new byte[2048];
        MulticastSocket socket = null;
        try {
            InetAddress group = InetAddress.getByName(SSDP_ADDR);
            socket = new MulticastSocket(SSDP_PORT);
            socket.joinGroup(group);
            socket.setSoTimeout(3000);
            Log.i(TAG, "SSDP listening on 239.255.255.250:1900");

            while (running) {
                try {
                    DatagramPacket packet = new DatagramPacket(buf, buf.length);
                    socket.receive(packet);
                    String data = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                    String senderIp = packet.getAddress().getHostAddress();
                    handleDatagram(data, senderIp);
                } catch (IOException timeout) {
                    // loop to check running flag
                } catch (Throwable t) {
                    callback.onError("recv error: " + t.getMessage());
                }
            }
        } catch (Throwable t) {
            callback.onError("socket error: " + t.getMessage());
        } finally {
            if (socket != null) {
                try { socket.leaveGroup(InetAddress.getByName(SSDP_ADDR)); } catch (Exception ignored) {}
                try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

    private void handleDatagram(String message, String senderIp) {
        String[] lines = message.split("\r?\n");
        String location = null;
        String server = null;
        String nt = null;
        String usn = null;
        for (String line : lines) {
            String u = line.trim();
            if (u.toUpperCase().startsWith("LOCATION:")) {
                location = u.substring(9).trim();
            } else if (u.toUpperCase().startsWith("SERVER:")) {
                server = u.substring(7).trim();
            } else if (u.toUpperCase().startsWith("NT:")) {
                nt = u.substring(3).trim();
            } else if (u.toUpperCase().startsWith("USN:")) {
                usn = u.substring(4).trim();
            }
        }
        if (location == null || nt == null) return;
        if (ntFilter != null && !ntFilter.equalsIgnoreCase(nt)) return;

        deviceLastSeen.put(location, System.currentTimeMillis());
        callback.onDiscovered(location, server, nt, usn, senderIp);
    }

    private void cleanupLoop() {
        if (!running) return;
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, Long>> it = deviceLastSeen.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Long> e = it.next();
            if (now - e.getValue() > cacheMaxAgeMs) {
                String location = e.getKey();
                it.remove();
                callback.onExpired(location);
            }
        }
        if (workerHandler != null) workerHandler.postDelayed(this::cleanupLoop, 5_000);
    }
}


