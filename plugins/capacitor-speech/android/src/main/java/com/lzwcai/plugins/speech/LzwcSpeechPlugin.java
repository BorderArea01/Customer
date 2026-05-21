package com.lzwcai.plugins.speech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginConfig;
import android.util.Log;

import org.json.JSONArray;

import java.util.concurrent.CompletableFuture;

@CapacitorPlugin(name = "LzwcSpeech")
public class LzwcSpeechPlugin extends Plugin {

    private LzwcSpeech implementation;

    @Override
    public void load() {
        String appId = null;
        String apiKey = null;
        String apiSecret = null;

        try {
            PluginConfig pluginCfg = getConfig();
            if (pluginCfg != null && !pluginCfg.isEmpty()) {
                appId = pluginCfg.getString("xunfeiAppId", null);
                apiKey = pluginCfg.getString("xunfeiApiKey", null);
                apiSecret = pluginCfg.getString("xunfeiApiSecret", null);
            }
        } catch (Exception e) {
            // 静默处理
        }

        implementation = new LzwcSpeech(getContext(), appId, apiKey, apiSecret);
        
        // 设置队列事件监听器
        implementation.setQueueEventListener(new LzwcSpeech.QueueEventListener() {
            @Override
            public void onQueueStart(int totalItems) {
                JSObject event = new JSObject();
                event.put("totalItems", totalItems);
                notifyListeners("queue_start", event);
            }
            
            @Override
            public void onQueueEnd(boolean completed, boolean interrupted) {
                JSObject event = new JSObject();
                event.put("completed", completed);
                event.put("interrupted", interrupted);
                notifyListeners("queue_end", event);
            }
            
            @Override
            public void onQueueItemStart(LzwcSpeech.QueueItem item, int index) {
                JSObject event = new JSObject();
                JSObject itemObj = new JSObject();
                itemObj.put("id", item.id);
                itemObj.put("text", item.text);
                itemObj.put("voice", item.voice);
                itemObj.put("speed", item.speed);
                itemObj.put("pitch", item.pitch);
                itemObj.put("volume", item.volume);
                itemObj.put("language", item.language);
                event.put("item", itemObj);
                event.put("index", index);
                notifyListeners("queue_item_start", event);
            }
            
            @Override
            public void onQueueItemEnd(LzwcSpeech.QueueItem item, int index, boolean success) {
                JSObject event = new JSObject();
                JSObject itemObj = new JSObject();
                itemObj.put("id", item.id);
                itemObj.put("text", item.text);
                itemObj.put("voice", item.voice);
                itemObj.put("speed", item.speed);
                itemObj.put("pitch", item.pitch);
                itemObj.put("volume", item.volume);
                itemObj.put("language", item.language);
                event.put("item", itemObj);
                event.put("index", index);
                event.put("success", success);
                notifyListeners("queue_item_end", event);
            }
            
            @Override
            public void onQueueError(String message) {
                JSObject event = new JSObject();
                event.put("message", message);
                notifyListeners("error", event);
                // 为了前端状态一致性，在发生错误时也发送 end 事件（标记为中断）
                JSObject endEvent = new JSObject();
                endEvent.put("interrupted", true);
                notifyListeners("end", endEvent);
            }
        });
    }

    @Override
    public void handleOnDestroy() {
        if (implementation != null) {
            implementation.destroy();
        }
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        try {
            String deviceId = call.getString("deviceId");
            String appIdOverride = call.getString("xunfeiAppId");
            String apiKeyOverride = call.getString("xunfeiApiKey");
            String apiSecretOverride = call.getString("xunfeiApiSecret");
            
            if (implementation != null) {
                // 如果前端传入了覆盖参数，则以运行时参数重建实现实例
                if ((appIdOverride != null && !appIdOverride.trim().isEmpty()) ||
                    (apiKeyOverride != null && !apiKeyOverride.trim().isEmpty()) ||
                    (apiSecretOverride != null && !apiSecretOverride.trim().isEmpty())) {
                    implementation = new LzwcSpeech(getContext(), appIdOverride, apiKeyOverride, apiSecretOverride);
                }
                implementation.initializeSDK(deviceId).thenAccept(success -> {
                    if (success) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    } else {
                        JSObject err = new JSObject();
                        err.put("message", "SDK initialization or authorization failed");
                        call.reject(err.toString());
                    }
                }).exceptionally(throwable -> {
                    JSObject err = new JSObject();
                    err.put("message", throwable.getMessage());
                    call.reject(err.toString());
                    return null;
                });
            } else {
                call.reject("Implementation not available");
            }
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("message", e.getMessage());
            call.reject(err.toString());
        }
    }

    @PluginMethod
    public void setCredentials(PluginCall call) {
        try {
            String appId = call.getString("xunfeiAppId");
            String apiKey = call.getString("xunfeiApiKey");
            String apiSecret = call.getString("xunfeiApiSecret");

            implementation = new LzwcSpeech(getContext(), appId, apiKey, apiSecret);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to set credentials: " + e.getMessage());
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        String voice = call.getString("voice", "xiaoyan");
        int speed = call.getInt("speed", 50);
        int pitch = call.getInt("pitch", 50);
        int volume = call.getInt("volume", 50);
        String language = call.getString("language", "zh-CN");

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text is required");
            return;
        }

        JSObject startEvent = new JSObject();
        startEvent.put("text", text);
        notifyListeners("start", startEvent);

        CompletableFuture.supplyAsync(() -> {
            try {
                Log.d("LzwcSpeechPlugin", "🎤 [speak] 开始合成文本: " + text);
                String result = implementation.synthesizeText(text, voice, speed, pitch, volume).get();
                Log.d("LzwcSpeechPlugin", "🎤 [speak] 合成完成，结果: " + result);
                return result;
            } catch (Exception e) {
                Log.e("LzwcSpeechPlugin", "🎤 [speak] 合成异常: " + e.getMessage(), e);
                throw new RuntimeException(e);
            }
        }).thenAccept(result -> {
            Log.d("LzwcSpeechPlugin", "✅ [speak] thenAccept 被调用，结果: " + result);
            JSObject ret = new JSObject();
            // 检查是否是用户停止
            if ("user_stopped".equals(result)) {
                ret.put("success", false);
                ret.put("user_stopped", true);  // 用户停止播放标识
                ret.put("message", "用户已停止播放");
            } else {
                ret.put("success", true);
                ret.put("user_stopped", false);  // 明确标识非用户停止
                ret.put("result", result);
            }
            call.resolve(ret);
            
            Log.d("LzwcSpeechPlugin", "🔚 [speak] 发送 end 事件 - interrupted: " + "user_stopped".equals(result));
            JSObject endEvent = new JSObject();
            endEvent.put("interrupted", "user_stopped".equals(result));
            notifyListeners("end", endEvent);
        }).exceptionally(throwable -> {
            Log.e("LzwcSpeechPlugin", "❌ [speak] exceptionally 被调用，异常: " + throwable.getMessage());
            // 检查是否是并发限制错误
            String errorMessage = throwable.getMessage();
            if (errorMessage != null && errorMessage.contains("已有语音合成任务在进行中")) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("message", errorMessage);
                call.resolve(ret);
            } else {
                call.reject("Synthesis error: " + errorMessage);
            }
            
            JSObject errorEvent = new JSObject();
            errorEvent.put("message", errorMessage);
            notifyListeners("error", errorEvent);
            // 为了前端状态一致性，在发生错误时也发送 end 事件（标记为中断）
            Log.d("LzwcSpeechPlugin", "🔚 [speak] 发送 end 事件（错误情况）- interrupted: true");
            JSObject endEvent = new JSObject();
            endEvent.put("interrupted", true);
            notifyListeners("end", endEvent);
            return null;
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        JSObject ret = new JSObject();
        JSONArray voices = new JSONArray();
        
        JSObject voice1 = new JSObject();
        voice1.put("voiceURI", "xiaoyan");
        voice1.put("name", "晓燕");
        voice1.put("language", "zh-CN");
        voice1.put("localService", true);
        voice1.put("default", true);
        voices.put(voice1);
        
        JSObject voice2 = new JSObject();
        voice2.put("voiceURI", "xiaofeng");
        voice2.put("name", "晓峰");
        voice2.put("language", "zh-CN");
        voice2.put("localService", true);
        voice2.put("default", false);
        voices.put(voice2);
        
        ret.put("voices", voices);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        implementation.stop();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
        
        JSObject endEvent = new JSObject();
        endEvent.put("interrupted", true);
        notifyListeners("end", endEvent);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        implementation.stop();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
        
        JSObject pauseEvent = new JSObject();
        pauseEvent.put("paused", true);
        notifyListeners("pause", pauseEvent);
    }

    @PluginMethod
    public void resume(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
        
        JSObject resumeEvent = new JSObject();
        resumeEvent.put("resumed", true);
        notifyListeners("resume", resumeEvent);
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isSpeaking", implementation.isSpeaking());
        call.resolve(ret);
    }
    
    @PluginMethod
    public void setLanguage(PluginCall call) {
        String language = call.getString("language", "zh-CN");
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
    
    @PluginMethod
    public void setRate(PluginCall call) {
        double rate = call.getDouble("rate", 1.0);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
    
    @PluginMethod
    public void setPitch(PluginCall call) {
        double pitch = call.getDouble("pitch", 1.0);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
    
    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = call.getDouble("volume", 1.0);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
    
    // 队列管理方法
    @PluginMethod
    public void addToQueue(PluginCall call) {
        String text = call.getString("text");
        String voice = call.getString("voice", "xiaoyan");
        int speed = call.getInt("speed", 50);
        int pitch = call.getInt("pitch", 50);
        int volume = call.getInt("volume", 50);
        String language = call.getString("language", "zh-CN");

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text is required");
            return;
        }

        try {
            String queueId = implementation.addToQueue(text, voice, speed, pitch, volume, language);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("queueId", queueId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to add to queue: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void startQueuePlayback(PluginCall call) {
        boolean autoStart = call.getBoolean("autoStart", true);
        boolean clearExisting = call.getBoolean("clearExisting", false);
        
        implementation.startQueuePlayback(autoStart, clearExisting).thenAccept(success -> {
            JSObject ret = new JSObject();
            ret.put("success", success);
            call.resolve(ret);
        }).exceptionally(throwable -> {
            call.reject("Failed to start queue playback: " + throwable.getMessage());
            return null;
        });
    }
    
    @PluginMethod
    public void stopQueuePlayback(PluginCall call) {
        try {
            implementation.stopQueuePlayback();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop queue playback: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void clearQueue(PluginCall call) {
        try {
            implementation.clearQueue();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to clear queue: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void getQueueStatus(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("isPlaying", implementation.isQueuePlaying());
            ret.put("currentIndex", implementation.getCurrentIndex());
            ret.put("totalItems", implementation.getQueueSize());
            ret.put("remainingItems", implementation.getQueueSize() - implementation.getCurrentIndex() - 1);
            
            LzwcSpeech.QueueItem currentItem = implementation.getCurrentItem();
            if (currentItem != null) {
                JSObject itemObj = new JSObject();
                itemObj.put("id", currentItem.id);
                itemObj.put("text", currentItem.text);
                itemObj.put("voice", currentItem.voice);
                itemObj.put("speed", currentItem.speed);
                itemObj.put("pitch", currentItem.pitch);
                itemObj.put("volume", currentItem.volume);
                itemObj.put("language", currentItem.language);
                ret.put("currentItem", itemObj);
            }
            
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get queue status: " + e.getMessage());
        }
    }
}
