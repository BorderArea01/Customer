# capacitor-funasr

funasr

## Install

```bash
npm install capacitor-funasr
npx cap sync
```

## API

<docgen-index>

* [`echo(...)`](#echo)
* [`initialize(...)`](#initialize)
* [`startListening()`](#startlistening)
* [`stopListening()`](#stoplistening)
* [`disconnect()`](#disconnect)
* [`getConnectionStatus()`](#getconnectionstatus)
* [`getAudioDevices()`](#getaudiodevices)
* [`selectAudioDevice(...)`](#selectaudiodevice)
* [`addListener('recognitionResult', ...)`](#addlistenerrecognitionresult-)
* [`addListener('connectionStatusChanged', ...)`](#addlistenerconnectionstatuschanged-)
* [`addListener('error', ...)`](#addlistenererror-)
* [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### echo(...)

```typescript
echo(options: { value: string; }) => Promise<{ value: string; }>
```

| Param         | Type                            |
| ------------- | ------------------------------- |
| **`options`** | <code>{ value: string; }</code> |

**Returns:** <code>Promise&lt;{ value: string; }&gt;</code>

--------------------


### initialize(...)

```typescript
initialize(options: { serverUrl: string; hotWords?: string; sampleRate?: number; chunkSize?: string; chunkInterval?: number; mode?: string; wavFormat?: string; }) => Promise<{ success: boolean; message?: string; }>
```

初始化FunASR连接

| Param         | Type                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ serverUrl: string; hotWords?: string; sampleRate?: number; chunkSize?: string; chunkInterval?: number; mode?: string; wavFormat?: string; }</code> |

**Returns:** <code>Promise&lt;{ success: boolean; message?: string; }&gt;</code>

--------------------


### startListening()

```typescript
startListening() => Promise<{ success: boolean; message?: string; }>
```

开始语音识别

**Returns:** <code>Promise&lt;{ success: boolean; message?: string; }&gt;</code>

--------------------


### stopListening()

```typescript
stopListening() => Promise<{ success: boolean; message?: string; }>
```

停止语音识别

**Returns:** <code>Promise&lt;{ success: boolean; message?: string; }&gt;</code>

--------------------


### disconnect()

```typescript
disconnect() => Promise<{ success: boolean; message?: string; }>
```

断开连接

**Returns:** <code>Promise&lt;{ success: boolean; message?: string; }&gt;</code>

--------------------


### getConnectionStatus()

```typescript
getConnectionStatus() => Promise<{ connected: boolean; status: string; }>
```

检查连接状态

**Returns:** <code>Promise&lt;{ connected: boolean; status: string; }&gt;</code>

--------------------


### getAudioDevices()

```typescript
getAudioDevices() => Promise<{ devices: AudioDevice[]; }>
```

获取可用音频设备

**Returns:** <code>Promise&lt;{ devices: AudioDevice[]; }&gt;</code>

--------------------


### selectAudioDevice(...)

```typescript
selectAudioDevice(options: { deviceId: string; }) => Promise<void>
```

选择音频设备

| Param         | Type                               |
| ------------- | ---------------------------------- |
| **`options`** | <code>{ deviceId: string; }</code> |

--------------------


### addListener('recognitionResult', ...)

```typescript
addListener(eventName: 'recognitionResult', listenerFunc: (result: RecognitionResult) => void) => Promise<any>
```

添加事件监听器

| Param              | Type                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| **`eventName`**    | <code>'recognitionResult'</code>                                                     |
| **`listenerFunc`** | <code>(result: <a href="#recognitionresult">RecognitionResult</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;any&gt;</code>

--------------------


### addListener('connectionStatusChanged', ...)

```typescript
addListener(eventName: 'connectionStatusChanged', listenerFunc: (status: ConnectionStatus) => void) => Promise<any>
```

| Param              | Type                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'connectionStatusChanged'</code>                                             |
| **`listenerFunc`** | <code>(status: <a href="#connectionstatus">ConnectionStatus</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;any&gt;</code>

--------------------


### addListener('error', ...)

```typescript
addListener(eventName: 'error', listenerFunc: (error: ErrorEvent) => void) => Promise<any>
```

| Param              | Type                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| **`eventName`**    | <code>'error'</code>                                                  |
| **`listenerFunc`** | <code>(error: <a href="#errorevent">ErrorEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;any&gt;</code>

--------------------


### Interfaces


#### AudioDevice

| Prop       | Type                                                               |
| ---------- | ------------------------------------------------------------------ |
| **`id`**   | <code>string</code>                                                |
| **`name`** | <code>string</code>                                                |
| **`type`** | <code>'default' \| 'microphone' \| 'headset' \| 'bluetooth'</code> |


#### RecognitionResult

识别结果事件

| Prop            | Type                 |
| --------------- | -------------------- |
| **`text`**      | <code>string</code>  |
| **`isFinal`**   | <code>boolean</code> |
| **`mode`**      | <code>string</code>  |
| **`timestamp`** | <code>number</code>  |


#### ConnectionStatus

连接状态事件

| Prop            | Type                 |
| --------------- | -------------------- |
| **`connected`** | <code>boolean</code> |
| **`status`**    | <code>string</code>  |
| **`message`**   | <code>string</code>  |


#### ErrorEvent

错误事件

| Prop          | Type                |
| ------------- | ------------------- |
| **`error`**   | <code>string</code> |
| **`code`**    | <code>number</code> |
| **`message`** | <code>string</code> |

</docgen-api>

## 变更与注意事项

### Web: 并发连接导致 onopen 中 send 报错的修复

现象：在极端情况下，快速重复调用连接/开始识别，可能出现 `InvalidStateError: Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.`。

原因：旧连接的 `onopen` 回调触发时，`this.websocket` 已被新的连接覆盖，导致回调中使用的引用处于 CONNECTING 状态。

修复：在 `src/web.ts` 中对 `WebSocket` 使用局部 `socket` 引用并在事件处理器内始终使用该引用；同时在发送初始化消息前校验 `socket.readyState === WebSocket.OPEN`，避免并发覆盖造成的状态错配。

使用建议：

- 调用顺序建议为：`initialize` → `startListening` → `stopListening`（可多次）→ `disconnect`。
- 避免对 `startListening` 进行并发/快速重复调用；如需防抖请在上层做好串行化。
