# Capacitor Speech Plugin

Capacitor plugin for Xunfei offline text-to-speech synthesis with web fallback.

## Features

- Offline TTS using Xunfei AIKit SDK
- Real-time audio streaming
- Multiple voice options (xiaoyan, xiaofeng)
- Adjustable speed, pitch, and volume
- Event-driven API
- Web fallback support

## Installation

```bash
npm install capacitor-speech
```

## Configuration

### 1. Capacitor Config

Add the following to your `capacitor.config.ts`:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  plugins: {
    LzwcSpeech: {
      xunfeiAppId: 'your_app_id',
      xunfeiApiKey: 'your_api_key', 
      xunfeiApiSecret: 'your_api_secret'
    }
  }
};

export default config;
```

### 2. Android SDK Setup

**Important**: You need to add the Xunfei AIKit SDK to your main Android app:

1. Download the AIKit SDK from Xunfei official website
2. Copy `AIKit.aar` to your main app's `android/app/libs/` directory
3. Add the following to your main app's `android/app/build.gradle`:

```gradle
dependencies {
    // ... other dependencies
    implementation(name: 'AIKit', ext: 'aar')
}
```

4. Add required permissions to your main app's `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
```

## Usage

### Basic Usage

```typescript
import { SpeechSynthesis } from 'capacitor-speech';

// Initialize the plugin
await SpeechSynthesis.initialize();

// Speak text
await SpeechSynthesis.speak({
  text: 'Hello, world!',
  voice: 'xiaoyan',
  speed: 50,
  pitch: 50,
  volume: 50
});

// Stop speaking
await SpeechSynthesis.stop();
```

### Advanced Usage

```typescript
// Get available voices
const voices = await SpeechSynthesis.getVoices();
console.log(voices.voices);

// Check if speaking
const isSpeaking = await SpeechSynthesis.isSpeaking();

// Add event listeners
SpeechSynthesis.addListener('start', (event) => {
  console.log('Started speaking:', event.text);
});

SpeechSynthesis.addListener('end', (event) => {
  console.log('Finished speaking, interrupted:', event.interrupted);
});

SpeechSynthesis.addListener('error', (event) => {
  console.error('Speech error:', event.message);
});
```

## API Reference

### Methods

- `initialize()`: Initialize the TTS engine
- `speak(options)`: Speak text with specified parameters
- `stop()`: Stop current speech
- `pause()`: Pause current speech
- `resume()`: Resume paused speech
- `getVoices()`: Get available voices
- `isSpeaking()`: Check if currently speaking
- `setLanguage(options)`: Set language
- `setRate(options)`: Set speech rate
- `setPitch(options)`: Set speech pitch
- `setVolume(options)`: Set speech volume

### Events

- `start`: Fired when speech starts
- `end`: Fired when speech ends
- `pause`: Fired when speech is paused
- `resume`: Fired when speech is resumed
- `error`: Fired when an error occurs
- `boundary`: Fired at word boundaries

## Voice Options

- `xiaoyan`: Female voice (default)
- `xiaofeng`: Male voice

## Parameters

- `speed`: Speech speed (0-100)
- `pitch`: Speech pitch (0-100)
- `volume`: Speech volume (0-100)
- `language`: Language code (default: 'zh-CN')

## License

MIT
