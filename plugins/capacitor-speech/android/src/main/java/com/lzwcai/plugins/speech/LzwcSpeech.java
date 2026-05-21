package com.lzwcai.plugins.speech;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

import com.iflytek.aikit.core.AeeEvent;
import com.iflytek.aikit.core.AiHandle;
import com.iflytek.aikit.core.AiHelper;
import com.iflytek.aikit.core.AiInput;
import com.iflytek.aikit.core.AiListener;
import com.iflytek.aikit.core.AiRequest;
import com.iflytek.aikit.core.AiResponse;
import com.iflytek.aikit.core.AiText;
import com.iflytek.aikit.core.AuthListener;
import com.iflytek.aikit.core.ErrType;
import com.iflytek.aikit.core.BaseLibrary;
import com.iflytek.aikit.core.LogLvl;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.UUID;

public class LzwcSpeech {
    // 队列项内部类
    public static class QueueItem {
        public final String id;
        public final String text;
        public final String voice;
        public final int speed;
        public final int pitch;
        public final int volume;
        public final String language;
        
        public QueueItem(String text, String voice, int speed, int pitch, int volume, String language) {
            this.id = UUID.randomUUID().toString();
            this.text = text;
            this.voice = voice;
            this.speed = speed;
            this.pitch = pitch;
            this.volume = volume;
            this.language = language;
        }
    }
    
    // 队列状态接口
    public interface QueueEventListener {
        void onQueueStart(int totalItems);
        void onQueueEnd(boolean completed, boolean interrupted);
        void onQueueItemStart(QueueItem item, int index);
        void onQueueItemEnd(QueueItem item, int index, boolean success);
        void onQueueError(String message);
    }

    private final String abilityId;
    private final String appId;
    private final String apiKey;
    private final String apiSecret;
    private final Context context;
    
    // 队列管理
    private final ConcurrentLinkedQueue<QueueItem> speechQueue = new ConcurrentLinkedQueue<>();
    private final AtomicBoolean isQueuePlaying = new AtomicBoolean(false);
    private final AtomicBoolean stopRequested = new AtomicBoolean(false);
    private final AtomicInteger currentIndex = new AtomicInteger(-1);
    private QueueItem currentItem = null;
    private QueueEventListener queueEventListener;
    
    // 音频和合成
    private AudioTrack audioTrack;
    private ExecutorService queueExecutor;
    private volatile boolean engineInitialized = false;
    private volatile boolean isFirstAudioChunk = true;
    private volatile boolean sdkInitialized = false;
    private volatile int authResult = -1;
    
    // 当前合成任务
    private AiHandle currentHandle;
    private CompletableFuture<String> currentSynthesisFuture;
    
    // 音频播放完成检测
    private volatile boolean synthesisCompleted = false;
    private volatile boolean audioPlaybackCompleted = false;
    private final Object playbackSync = new Object();

    public LzwcSpeech(Context context, String appId, String apiKey, String apiSecret) {
        this.context = context;
        this.appId = appId != null ? appId : "";
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.queueExecutor = Executors.newSingleThreadExecutor();
        initializeAudioTrack();
        // 使用默认能力ID
        this.abilityId = "ece9d3c90";
    }
    
    // 设置队列事件监听器
    public void setQueueEventListener(QueueEventListener listener) {
        this.queueEventListener = listener;
    }

    private void initializeAudioTrack() {
        int sampleRate = 16000;
        int bufferSize = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );

        audioTrack = new AudioTrack(
            AudioManager.STREAM_MUSIC,
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
            AudioTrack.MODE_STREAM
        );
    }

    // 队列管理方法
    public String addToQueue(String text, String voice, int speed, int pitch, int volume, String language) {
        QueueItem item = new QueueItem(text, voice != null ? voice : "xiaoyan", speed, pitch, volume, language != null ? language : "zh-CN");
        speechQueue.offer(item);
        return item.id;
    }
    
    public CompletableFuture<Boolean> startQueuePlayback(boolean autoStart, boolean clearExisting) {
        if (clearExisting) {
            clearQueue();
        }
        
        if (isQueuePlaying.get()) {
            return CompletableFuture.completedFuture(true);
        }
        
        CompletableFuture<Boolean> future = new CompletableFuture<>();
        
        if (speechQueue.isEmpty()) {
            future.complete(false);
            return future;
        }
        
        queueExecutor.submit(() -> {
            try {
                playQueueInternal();
                future.complete(true);
            } catch (Exception e) {
                future.completeExceptionally(e);
            }
        });
        
        return future;
    }
    
    public void stopQueuePlayback() {
        stopRequested.set(true);
        if (currentHandle != null) {
            AiHelper.getInst().end(currentHandle);
        }
        stopAudioPlayback();
        
        if (queueEventListener != null && isQueuePlaying.get()) {
            queueEventListener.onQueueEnd(false, true);
        }
        
        isQueuePlaying.set(false);
        currentIndex.set(-1);
        currentItem = null;
    }
    
    public void clearQueue() {
        speechQueue.clear();
    }
    
    public int getQueueSize() {
        return speechQueue.size();
    }
    
    public boolean isQueuePlaying() {
        return isQueuePlaying.get();
    }
    
    public QueueItem getCurrentItem() {
        return currentItem;
    }
    
    public int getCurrentIndex() {
        return currentIndex.get();
    }
    
    // 兼容方法：单句播放（内部转为队列）
    public CompletableFuture<String> synthesizeText(String text, String voice, int speed, int pitch, int volume) {
        // 清空当前队列，添加新项目，立即播放
        clearQueue();
        addToQueue(text, voice, speed, pitch, volume, "zh-CN");
        
        CompletableFuture<String> result = new CompletableFuture<>();
        
        // 设置临时监听器
        AtomicBoolean itemFailed = new AtomicBoolean(false);
        QueueEventListener tempListener = new QueueEventListener() {
            @Override
            public void onQueueStart(int totalItems) {}
            
            @Override
            public void onQueueEnd(boolean completed, boolean interrupted) {
                Log.d("LzwcSpeech", "🔚 [onQueueEnd] 队列结束事件触发 - completed: " + completed + ", interrupted: " + interrupted);
                Log.d("LzwcSpeech", "🔚 [onQueueEnd] result.isDone(): " + result.isDone());
                Log.d("LzwcSpeech", "🔚 [onQueueEnd] speechQueue.isEmpty(): " + speechQueue.isEmpty());
                Log.d("LzwcSpeech", "🔚 [onQueueEnd] stopRequested.get(): " + stopRequested.get());
                Log.d("LzwcSpeech", "🔚 [onQueueEnd] itemFailed.get(): " + itemFailed.get());
                
                // 如果已经被标记为失败，不再处理
                if (result.isDone()) {
                    Log.d("LzwcSpeech", "🔚 [onQueueEnd] result已完成，跳过处理");
                    return;
                }
                
                if (interrupted) {
                    Log.d("LzwcSpeech", "🔚 [onQueueEnd] 用户中断，完成 result: user_stopped");
                    result.complete("user_stopped");
                } else if (completed) {
                    Log.d("LzwcSpeech", "🔚 [onQueueEnd] 正常完成，完成 result: synthesis_completed");
                    result.complete("synthesis_completed");
                } else {
                    // 如果队列为空且没有中断，说明播放已完成，只是completed标志可能有问题
                    // 这种情况下应该认为是成功完成，而不是失败
                    if (speechQueue.isEmpty() && !stopRequested.get() && !itemFailed.get()) {
                        Log.d("LzwcSpeech", "🔚 [onQueueEnd] completed=false但队列为空，视为成功完成");
                        result.complete("synthesis_completed");
                    } else {
                        Log.e("LzwcSpeech", "🔚 [onQueueEnd] 播放失败，触发异常");
                        result.completeExceptionally(new Exception("Synthesis failed"));
                    }
                }
            }
            
            @Override
            public void onQueueItemStart(QueueItem item, int index) {}
            
            @Override
            public void onQueueItemEnd(QueueItem item, int index, boolean success) {
                Log.d("LzwcSpeech", "🎵 [onQueueItemEnd] 队列项结束 - index: " + index + ", success: " + success);
                if (!success) {
                    Log.e("LzwcSpeech", "🎵 [onQueueItemEnd] 队列项失败，标记 itemFailed");
                    itemFailed.set(true);
                    // 只有在result未完成时才设置异常
                    if (!result.isDone()) {
                        Log.e("LzwcSpeech", "🎵 [onQueueItemEnd] 触发异常: Synthesis failed");
                        result.completeExceptionally(new Exception("Synthesis failed"));
                    }
                }
            }
            
            @Override
            public void onQueueError(String message) {
                // 只有在result未完成时才设置异常
                if (!result.isDone()) {
                    result.completeExceptionally(new Exception(message));
                }
            }
        };
        
        QueueEventListener originalListener = this.queueEventListener;
        this.queueEventListener = tempListener;
        
        startQueuePlayback(false, false).whenComplete((success, throwable) -> {
            if (throwable != null) {
                result.completeExceptionally(throwable);
            }
        });
        
        // 恢复原监听器
        result.whenComplete((res, ex) -> {
            this.queueEventListener = originalListener;
        });
        
        return result;
    }
    
    // 核心队列播放逻辑
    private void playQueueInternal() throws Exception {
        if (!sdkInitialized) {
            initializeSDK(null).get(15, TimeUnit.SECONDS);
        }
        
        if (!sdkInitialized || authResult != 0) {
            throw new Exception("SDK not initialized or authorization failed");
        }
        
        ensureEngineInitialized();
        
        isQueuePlaying.set(true);
        stopRequested.set(false);
        currentIndex.set(-1);
        
        int totalItems = speechQueue.size();
        
        if (queueEventListener != null) {
            queueEventListener.onQueueStart(totalItems);
        }
        
        try {
            while (!speechQueue.isEmpty() && !stopRequested.get()) {
                currentItem = speechQueue.poll();
                currentIndex.incrementAndGet();
                
                if (currentItem == null) break;
                
                if (queueEventListener != null) {
                    queueEventListener.onQueueItemStart(currentItem, currentIndex.get());
                }
                
                boolean success = synthesizeSingleItem(currentItem);
                
                if (queueEventListener != null) {
                    queueEventListener.onQueueItemEnd(currentItem, currentIndex.get(), success);
                }
                
                if (!success && !stopRequested.get()) {
                    // 错误发生时停止音频播放
                    stopAudioPlayback();
                    // 重置播放完成状态
                    synchronized (playbackSync) {
                        synthesisCompleted = false;
                        audioPlaybackCompleted = false;
                    }
                    if (queueEventListener != null) {
                        queueEventListener.onQueueError("Failed to synthesize: " + currentItem.text);
                    }
                    break;
                }
                
                // 短暂延迟，确保音频衔接流畅
                if (!speechQueue.isEmpty() && !stopRequested.get()) {
                    Thread.sleep(50);
                }
            }
        } finally {
            boolean completed = speechQueue.isEmpty() && !stopRequested.get();
            Log.d("LzwcSpeech", "🏁 [playQueueInternal] finally块 - completed: " + completed + ", interrupted: " + stopRequested.get());
            Log.d("LzwcSpeech", "🏁 [playQueueInternal] speechQueue.isEmpty(): " + speechQueue.isEmpty());
            Log.d("LzwcSpeech", "🏁 [playQueueInternal] stopRequested.get(): " + stopRequested.get());
            
            if (queueEventListener != null) {
                Log.d("LzwcSpeech", "🏁 [playQueueInternal] 调用 onQueueEnd - completed: " + completed + ", interrupted: " + stopRequested.get());
                queueEventListener.onQueueEnd(completed, stopRequested.get());
            } else {
                Log.w("LzwcSpeech", "🏁 [playQueueInternal] queueEventListener为null，无法触发onQueueEnd");
            }
            
            isQueuePlaying.set(false);
            currentIndex.set(-1);
            currentItem = null;
        }
    }
    
    // 合成单个队列项
    private boolean synthesizeSingleItem(QueueItem item) {
        try {
            currentSynthesisFuture = new CompletableFuture<>();
            
            AiHelper.getInst().registerListener(abilityId, new AiListener() {
                @Override
                public void onResult(int handleID, List<AiResponse> list, Object usrContext) {
                    handleSynthesisResult(handleID, list);
                }

                @Override
                public void onEvent(int handleID, int event, List<AiResponse> eventData, Object usrContext) {
                    if (event == AeeEvent.AEE_EVENT_END.getValue()) {
                        handleSynthesisEnd(handleID);
                    }
                }

                @Override
                public void onError(int handleID, int err, String msg, Object usrContext) {
                    if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
                        currentSynthesisFuture.completeExceptionally(new Exception("Synthesis error: (" + err + ") " + msg));
                    }
                }
            });

            int normalizedSpeed = Math.max(0, Math.min(100, item.speed));
            int normalizedPitch = Math.max(0, Math.min(100, item.pitch));
            int normalizedVolume = Math.max(0, Math.min(100, item.volume));

            AiInput.Builder paramBuilder = AiInput.builder();
            paramBuilder.param("vcn", item.voice);
            paramBuilder.param("textEncoding", "UTF-8");
            paramBuilder.param("pitch", normalizedPitch);
            paramBuilder.param("volume", normalizedVolume);
            paramBuilder.param("speed", normalizedSpeed);

            currentHandle = AiHelper.getInst().start(abilityId, paramBuilder.build(), null);
            if (currentHandle.getCode() != 0) {
                // 启动失败，尝试确保引擎已初始化后重试一次
                try {
                    ensureEngineInitialized();
                } catch (Throwable ignored) {}
                currentHandle = AiHelper.getInst().start(abilityId, paramBuilder.build(), null);
                if (currentHandle.getCode() != 0) {
                    if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
                        currentSynthesisFuture.completeExceptionally(new Exception("Start failed code=" + currentHandle.getCode()));
                    }
                    return false;
                }
            }

            AiRequest.Builder dataBuilder = AiRequest.builder();
            AiText input = AiText.get("text")
                .data(item.text)
                .valid();
            dataBuilder.payload(input);

            int ret = AiHelper.getInst().write(dataBuilder.build(), currentHandle);
            if (ret != 0) {
                // 写入失败，重试一次
                ret = AiHelper.getInst().write(dataBuilder.build(), currentHandle);
                if (ret != 0) {
                    if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
                        currentSynthesisFuture.completeExceptionally(new Exception("Write failed code=" + ret));
                    }
                    return false;
                }
            }

            // 等待合成完成（自适应超时：长文本允许更长时间）
            int textLength = item.text != null ? item.text.length() : 0;
            // 经验策略：至少60秒，按每3字符≈1秒估算，最大不超过300秒
            int adaptiveTimeoutSec = Math.min(300, Math.max(60, (int) Math.ceil(textLength / 3.0)));
            Log.d("LzwcSpeech", "⏱ [synthesizeSingleItem] 超时设置 - textLength: " + textLength + ", timeoutSec: " + adaptiveTimeoutSec);
            String result = currentSynthesisFuture.get(adaptiveTimeoutSec, TimeUnit.SECONDS);
            Log.d("LzwcSpeech", "✅ [synthesizeSingleItem] 合成完成，返回结果: " + result);
            boolean success = !"user_stopped".equals(result);
            Log.d("LzwcSpeech", "✅ [synthesizeSingleItem] 返回 success: " + success);
            return success;
            
        } catch (Exception e) {
            // 错误发生时停止音频播放
            stopAudioPlayback();
            if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
                currentSynthesisFuture.completeExceptionally(new Exception("Synthesis exception: " + e.getMessage()));
            }
            // 重置播放完成状态
            synchronized (playbackSync) {
                synthesisCompleted = false;
                audioPlaybackCompleted = false;
            }
            return false;
        }
    }

    private void copyAssetsToWorkDir(String workDir) {
        try {
            AssetManager assetManager = context.getAssets();
            String sourceDir = "aisound";
            String targetDir = workDir + File.separator + "aisound";
            
            File targetDirFile = new File(targetDir);
            if (!targetDirFile.exists()) {
                targetDirFile.mkdirs();
            }

            String[] assetFiles = assetManager.list(sourceDir);
            if (assetFiles != null) {
                for (String fileName : assetFiles) {
                    InputStream inputStream = assetManager.open(sourceDir + "/" + fileName);
                    FileOutputStream outputStream = new FileOutputStream(new File(targetDir, fileName));
                    
                    byte[] buffer = new byte[1024];
                    int length;
                    while ((length = inputStream.read(buffer)) > 0) {
                        outputStream.write(buffer, 0, length);
                    }
                    
                    inputStream.close();
                    outputStream.close();
                }
            }
        } catch (IOException e) {
            // 静默处理
        }
    }

    public synchronized CompletableFuture<Boolean> initializeSDK(String deviceId) {
        if (sdkInitialized) {
            return CompletableFuture.completedFuture(true);
        }

        final CompletableFuture<Boolean> initFuture = new CompletableFuture<>();
        
        String workDir = new File(context.getFilesDir(), "iflytek").getAbsolutePath();
        
        File workDirFile = new File(workDir);
        if (!workDirFile.exists()) {
            workDirFile.mkdirs();
        }

        copyAssetsToWorkDir(workDir);

        try { 
            String aeeLogPath = workDir + "/aeeLog.txt";
            AiHelper.getInst().setLogInfo(LogLvl.ERROR, 0, aeeLogPath); 
        } catch (Throwable ignored) {}

        AiHelper.getInst().registerListener(new AuthListener() {
            @Override
            public void onAuthStateChange(ErrType type, int code) {
                if (type == ErrType.AUTH) {
                    authResult = code;
                    if (code == 0) {
                        sdkInitialized = true;
                        try {
                            ensureEngineInitialized();
                        } catch (Throwable t) {
                            // 静默处理
                        }
                        initFuture.complete(true);
                    } else {
                        initFuture.complete(false);
                    }
                }
            }
        });

        BaseLibrary.Params.Builder paramsBuilder = BaseLibrary.Params.builder()
            .appId(appId)
            .apiKey(apiKey != null ? apiKey : "")
            .apiSecret(apiSecret != null ? apiSecret : "")
            .workDir(workDir);
            
        // 如果提供了deviceId，则设置为customDeviceId
        if (deviceId != null && !deviceId.trim().isEmpty()) {
            paramsBuilder.customDeviceId(deviceId);
        }
        
        BaseLibrary.Params params = paramsBuilder.build();

        new Thread(() -> {
            try {
                AiHelper.getInst().initEntry(context.getApplicationContext(), params);
            } catch (Exception e) {
                initFuture.complete(false);
            }
        }).start();

        return initFuture;
    }

    private synchronized void ensureEngineInitialized() {
        if (!engineInitialized && sdkInitialized && authResult == 0) {
            AiHelper.getInst().engineInit(abilityId);
            engineInitialized = true;
        }
    }

    private void handleSynthesisResult(int handleID, List<AiResponse> responses) {
        if (responses != null && !responses.isEmpty()) {
            for (AiResponse response : responses) {
                byte[] audioData = response.getValue();
                if (audioData != null && audioData.length > 0) {
                    playAudioData(audioData);
                }
            }
        }
    }

    private void playAudioData(byte[] audioData) {
        try {
            if (audioTrack != null) {
                if (isFirstAudioChunk || audioTrack.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) {
                    audioTrack.play();
                    isFirstAudioChunk = false;
                    
                    // 重置播放完成状态
                    synchronized (playbackSync) {
                        synthesisCompleted = false;
                        audioPlaybackCompleted = false;
                    }
                }
                
                audioTrack.write(audioData, 0, audioData.length);
            }
        } catch (Exception e) {
            // 静默处理
        }
    }

    private void handleSynthesisEnd(int handleID) {
        Log.d("LzwcSpeech", "🎬 [handleSynthesisEnd] 合成结束 - handleID: " + handleID);
        if (currentHandle != null) {
            AiHelper.getInst().end(currentHandle);
        }
        
        // 标记合成完成，但等待音频播放完成
        synthesisCompleted = true;
        Log.d("LzwcSpeech", "🎬 [handleSynthesisEnd] 标记 synthesisCompleted = true，开始监控音频播放");
        
        // 在队列模式下，使用更短的延时来检测播放完成
        if (isQueuePlaying.get()) {
            // 队列模式：使用较短的延时检测
            Log.d("LzwcSpeech", "🎬 [handleSynthesisEnd] 队列模式，启动音频监控（200ms延时）");
            startAudioPlaybackMonitoring(200); // 200ms延时
        } else {
            // 单次播放模式：使用较长的延时检测
            Log.d("LzwcSpeech", "🎬 [handleSynthesisEnd] 单次播放模式，启动音频监控（100ms延时）");
            startAudioPlaybackMonitoring(100); // 100ms延时
        }
    }
    
    private void startAudioPlaybackMonitoring(int initialDelayMs) {
        // 在后台线程中监控音频播放完成
        new Thread(() -> {
            try {
                Log.d("LzwcSpeech", "📊 [AudioMonitor] 开始监控音频播放 - initialDelayMs: " + initialDelayMs);
                // 等待一小段时间让音频开始播放
                Thread.sleep(initialDelayMs);

                int stagnantCheckIntervalMs = 50; // 检查间隔
                int stagnantAccumulatedMs = 0;    // 播放头无进展累计时长
                int lastPlaybackPosition = -1;
                int maxGuardMs = 10000;           // 最大保护时长，避免极端情况下无法退出
                int elapsedMs = 0;

                Log.d("LzwcSpeech", "📊 [AudioMonitor] 开始循环检查 - synthesisCompleted: " + synthesisCompleted + ", audioPlaybackCompleted: " + audioPlaybackCompleted);
                // 监控音频播放状态
                while (synthesisCompleted && !audioPlaybackCompleted) {
                    synchronized (playbackSync) {
                        if (audioTrack != null) {
                            int playState = audioTrack.getPlayState();
                            int playbackPosition = audioTrack.getPlaybackHeadPosition();

                            if (playState != AudioTrack.PLAYSTATE_PLAYING) {
                                // 不在播放，认为已完成
                                Log.d("LzwcSpeech", "📊 [AudioMonitor] AudioTrack不在播放状态，判定完成 - playState: " + playState);
                                audioPlaybackCompleted = true;
                                break;
                            }

                            // 播放中：检测播放头是否前进
                            if (lastPlaybackPosition >= 0 && playbackPosition <= lastPlaybackPosition) {
                                stagnantAccumulatedMs += stagnantCheckIntervalMs;
                            } else {
                                stagnantAccumulatedMs = 0;
                            }
                            lastPlaybackPosition = playbackPosition;

                            // 若播放头在一定时间内没有前进，认为缓冲已耗尽且播放完成
                            if (stagnantAccumulatedMs >= 600) { // 600ms 无前进，判定完成
                                Log.d("LzwcSpeech", "📊 [AudioMonitor] 播放头停滞600ms，判定完成 - lastPosition: " + lastPlaybackPosition + ", currentPosition: " + playbackPosition);
                                audioPlaybackCompleted = true;
                                break;
                            }
                        } else {
                            Log.w("LzwcSpeech", "📊 [AudioMonitor] audioTrack为null");
                        }
                    }

                    // 每50ms检查一次
                    Thread.sleep(stagnantCheckIntervalMs);
                    elapsedMs += stagnantCheckIntervalMs;
                    if (elapsedMs >= maxGuardMs) {
                        // 保护退出：防止极端情况下无法检测到完成
                        Log.w("LzwcSpeech", "📊 [AudioMonitor] 达到最大保护时长，强制退出 - elapsedMs: " + elapsedMs);
                        synchronized (playbackSync) {
                            audioPlaybackCompleted = true;
                        }
                        break;
                    }
                }

                Log.d("LzwcSpeech", "✅ [AudioMonitor] 音频播放完成，停止播放并完成 future");
                // 音频播放完成，确保停止播放，触发完成事件
                stopAudioPlayback();
                if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
                    Log.d("LzwcSpeech", "✅ [AudioMonitor] 完成 currentSynthesisFuture: audio_playback_completed");
                    currentSynthesisFuture.complete("audio_playback_completed");
                } else {
                    Log.w("LzwcSpeech", "⚠️ [AudioMonitor] currentSynthesisFuture为null或已完成 - isNull: " + (currentSynthesisFuture == null) + ", isDone: " + (currentSynthesisFuture != null && currentSynthesisFuture.isDone()));
                }

            } catch (InterruptedException e) {
                // 线程被中断，直接完成
                Log.w("LzwcSpeech", "⚠️ [AudioMonitor] 监控线程被中断");
                if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
                    currentSynthesisFuture.complete("interrupted");
                }
            }
        }).start();
    }

    private void stopAudioPlayback() {
        if (audioTrack != null && audioTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
            try {
                audioTrack.stop();
                isFirstAudioChunk = true;
            } catch (Exception e) {
                // 静默处理
            }
        }
    }

    public void stop() {
        // 停止队列播放
        stopQueuePlayback();
        
        // 停止音频播放
        stopAudioPlayback();
        
        // 重置播放完成状态
        synchronized (playbackSync) {
            synthesisCompleted = false;
            audioPlaybackCompleted = false;
        }
        
        if (currentSynthesisFuture != null && !currentSynthesisFuture.isDone()) {
            currentSynthesisFuture.complete("user_stopped");
        }
    }

    public boolean isSpeaking() {
        synchronized (playbackSync) {
            // 如果合成完成但音频播放未完成，仍然认为在播放
            if (synthesisCompleted && !audioPlaybackCompleted) {
                return true;
            }
        }
        return (isQueuePlaying.get() || audioTrack != null && audioTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING);
    }

    public void destroy() {
        // 停止队列播放
        stopQueuePlayback();
        
        // 关闭执行器
        if (queueExecutor != null && !queueExecutor.isShutdown()) {
            queueExecutor.shutdown();
        }
        
        // 释放音频资源
        if (audioTrack != null) {
            audioTrack.release();
        }
        
        // 清理讯飞资源
        AiHelper.getInst().engineUnInit(abilityId);
    }
}
