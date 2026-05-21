import { WebPlugin } from '@capacitor/core';

import type { LzwcFunasrPlugin, AudioDevice } from './definitions';

export class LzwcFunasrWeb extends WebPlugin implements LzwcFunasrPlugin {
  private websocket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private isRecording = false;
  private isConnected = false;
  private serverUrl = '';
  private config: any = {};
  private selectedDeviceId: string | null = null;
  // 文本缓冲：用于在最终结果缺失文本时进行回退合成
  private onlineAccumulatedText: string = '';
  private offlineAccumulatedText: string = '';
  // 已移除最终空文本回退策略，不再需要记录最后非空文本

  // 接口兼容：保留 echo 以满足插件接口定义
  async echo(options: { value: string }): Promise<{ value: string }> {
    return options;
  }

  async initialize(options: {
    serverUrl: string;
    hotWords?: string;
    sampleRate?: number;
    chunkSize?: string;
    chunkInterval?: number;
    mode?: string;
    wavFormat?: string;
    emitOnlyOffline?: boolean;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      this.serverUrl = options.serverUrl;
      this.config = {
        hotWords: options.hotWords || '',
        sampleRate: options.sampleRate || 16000,
        chunkSize: options.chunkSize || '5,10,5',
        chunkInterval: options.chunkInterval || 10,
        mode: options.mode || '2pass',
        wavFormat: options.wavFormat || 'PCM'
      };
      // 重置缓冲与状态
      this.onlineAccumulatedText = '';
      this.offlineAccumulatedText = '';
      

      // 初始化音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate
      });


      return { success: true, message: 'Initialized successfully' };
    } catch (error) {
      console.error('FunASR initialization failed:', error);
      return { success: false, message: `Initialization failed: ${error}` };
    }
  }

  async startListening(): Promise<{ success: boolean; message?: string }> {
    try {
      if (this.isRecording) {
        return { success: false, message: 'Already recording' };
      }

      // 建立连接并开始推流
      await this.connectWebSocket();

      // 开始录音
      await this.startRecording();

      this.isRecording = true;

      return { success: true, message: 'Started listening' };
    } catch (error) {
      console.error('Failed to start listening:', error);
      return { success: false, message: `Failed to start listening: ${error}` };
    }
  }

  async stopListening(): Promise<{ success: boolean; message?: string }> {
    try {
      if (!this.isRecording) {
        return { success: false, message: 'Not recording' };
      }

      // 先告知服务端说话结束，再停止录音（保持连接以便后续继续）
      try {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ 
            is_speaking: false,
          }));
        }
      } catch {}

      // 停止录音但不断开连接
      this.stopRecording();
      this.isRecording = false;


      return { success: true, message: 'Stopped listening' };
    } catch (error) {
      console.error('Failed to stop listening:', error);
      return { success: false, message: `Failed to stop listening: ${error}` };
    }
  }

  async disconnect(): Promise<{ success: boolean; message?: string }> {
    try {
      this.stopRecording();
      this.disconnectWebSocket();
      this.isRecording = false;
      this.isConnected = false;


      return { success: true, message: 'Disconnected successfully' };
    } catch (error) {
      console.error('Failed to disconnect:', error);
      return { success: false, message: `Failed to disconnect: ${error}` };
    }
  }

  async getConnectionStatus(): Promise<{ connected: boolean; status: string }> {
    const status = this.isConnected ? 'connected' : 'disconnected';
    return { connected: this.isConnected, status };
  }

  async sendHeartbeat(): Promise<{ success: boolean; message?: string }> {
    try {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return { success: false, message: 'WebSocket is not connected' };
      }

      // 发送心跳消息，使用简单的 JSON 消息保持连接活跃
      const heartbeatMessage = {
        type: 'heartbeat',
        timestamp: Date.now()
      };

      this.websocket.send(JSON.stringify(heartbeatMessage));
      return { success: true, message: 'Heartbeat sent successfully' };
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
      return { success: false, message: `Failed to send heartbeat: ${error}` };
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        const socket = new WebSocket(this.serverUrl);
        // 将当前实例引用为最新 socket
        this.websocket = socket;
        // 处理二进制数据
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {

          // 仅当回调来自当前 socket 时才更新状态
          if (this.websocket !== socket) {
            return;
          }

          this.isConnected = true;

          // 发送初始化配置
          const chunkSizeArray = this.config.chunkSize.split(',').map((s: string) => parseInt(s.trim()));
          const initMessage = {
            mode: this.config.mode,
            chunk_size: chunkSizeArray,
            chunk_interval: this.config.chunkInterval,
            wav_name: 'microphone',
            wav_format: this.config.wavFormat,
            audio_fs: this.config.sampleRate,
            hotwords: this.config.hotWords,
            itn: true,
            is_speaking: true
          };

          // 使用局部 socket 引用发送，避免并发覆盖导致的 CONNECTING 错误
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(initMessage));
          }

          // 初始化缓冲
          this.onlineAccumulatedText = '';
          this.offlineAccumulatedText = '';

          this.notifyListeners('connectionStatusChanged', {
            connected: true,
            status: 'connected'
          });

          resolve();
        };

        socket.onmessage = (event) => {
          try {
            // 处理文本与二进制消息（当前仅使用文本）
            if (typeof event.data === 'string') {
              const data = JSON.parse(event.data);
              const mode: string = data.mode || '';
              const isFinal: boolean = Boolean(data.is_final === true);
              const textFieldPresent = (data.text !== undefined && data.text !== null);
              const incomingText: string = textFieldPresent ? String(data.text) : '';

              // 根据模式维护缓冲
              if (incomingText) {
                if (mode === '2pass-online') {
                  this.onlineAccumulatedText += incomingText;
                } else if (mode === '2pass-offline') {
                  this.offlineAccumulatedText += incomingText;
                } else {
                  // 未声明模式时，默认按在线结果累积
                  this.onlineAccumulatedText += incomingText;
                }
              }

              // 计算要输出的文本：不再在最终无文本时使用缓冲回退，保持空文本以便上层做友好提示
              const emitText = incomingText;

              // 仅当存在文本或明确的最终标志时才通知上层
              if (emitText || isFinal) {
                this.notifyListeners('recognitionResult', {
                  text: emitText,
                  isFinal: isFinal,
                  mode: mode || (this.offlineAccumulatedText ? '2pass-offline' : '2pass-online'),
                  timestamp: Number(Date.now())
                });
              }

              // 最终一次后清空缓冲，避免下轮误用历史文本
              if (isFinal) {
                this.onlineAccumulatedText = '';
                this.offlineAccumulatedText = '';
              }

            } else {
              // 保留：二进制通道暂不处理
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnected = false;
          this.notifyListeners('error', {
            error: 'WebSocket connection error',
            message: 'Failed to connect to server'
          });
          // 修复：不要立即reject，给重连机会
          setTimeout(() => {
            if (!this.isConnected) {
              reject(error);
            }
          }, 1000);
        };

        socket.onclose = () => {

          this.isConnected = false;
          // 连接关闭时清理缓冲，避免跨会话串扰
          this.onlineAccumulatedText = '';
          this.offlineAccumulatedText = '';
          this.notifyListeners('connectionStatusChanged', {
            connected: false,
            status: 'disconnected'
          });
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  private disconnectWebSocket(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.isConnected = false;
  }

  private async startRecording(): Promise<void> {
    try {
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: this.config.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      };

      // 如果选择了特定设备，添加设备ID约束
      if (this.selectedDeviceId) {
        audioConstraints.deviceId = { exact: this.selectedDeviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      // 使用AudioContext直接处理音频流
      const source = this.audioContext!.createMediaStreamSource(stream);
      const processor = this.audioContext!.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (this.websocket?.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer;
          const pcmData = this.audioBufferToPCM(inputBuffer);
          // Send as Uint8Array to match the binary format expected by FunASR
          const uint8Array = new Uint8Array(pcmData);
          this.websocket.send(uint8Array);
        }
      };

      source.connect(processor);
      processor.connect(this.audioContext!.destination);
      
      // 保存引用以便后续清理
      this.mediaRecorder = { 
        stream, 
        source, 
        processor,
        stop: () => {
          processor.disconnect();
          source.disconnect();
          stream.getTracks().forEach(track => track.stop());
        },
        state: 'recording'
      } as any;


    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;

    }
  }

  private audioBufferToPCM(audioBuffer: AudioBuffer): ArrayBuffer {
    const length = audioBuffer.length;
    const pcmData = new Int16Array(length);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
    }

    return pcmData.buffer;
  }

  async getAudioDevices(): Promise<{ devices: AudioDevice[] }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          id: device.deviceId,
          name: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          type: this.getDeviceType(device.label)
        }));

      return { devices: audioInputDevices };
    } catch (error) {
      console.error('Failed to get audio devices:', error);
      throw error;
    }
  }

  async selectAudioDevice(options: { deviceId: string }): Promise<void> {
    try {
      this.selectedDeviceId = options.deviceId;

    } catch (error) {
      console.error('Failed to select audio device:', error);
      throw error;
    }
  }

  private getDeviceType(label: string): 'microphone' | 'headset' | 'bluetooth' | 'default' {
    const lowerLabel = label.toLowerCase();

    if (lowerLabel.includes('bluetooth') || lowerLabel.includes('airpods') || lowerLabel.includes('wireless')) {
      return 'bluetooth';
    }

    if (lowerLabel.includes('headset') || lowerLabel.includes('headphone')) {
      return 'headset';
    }

    if (lowerLabel.includes('default')) {
      return 'default';
    }

    return 'microphone';
  }
}
