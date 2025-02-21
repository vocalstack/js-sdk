[![](/logo.svg 'VocalStack')](https://www.vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcribe-from-a-microphone-or-live-stream)

# Transcribe from a Microphone or LiveStream

> Transcribe live speech from a microphone or live stream. Integrate with Polyglot to create a public shareable link for the transcription which users can read in any language. 

## Table of Contents
  - [Transcribe from a Microphone](#transcribe-from-a-microphone)
    - [On the Server](#on-the-server)
    - [On the Web Browser](#on-the-web-browser)
  - [Transcribe from an HLS LiveStream](#transcribe-from-an-hls-livestream)
  - [Integration with Polyglot](#integration-with-polyglot)
    - [Benefits](#benefits)
    - [White labeling](#white-labeling)
    - [Learn More](#learn-more)
  - [Next Steps](#next-steps)

## Transcribe from a Microphone

To transcribe from a microphone we must continually send audio data stream packets to the VocalStack API.

```js
import { LiveTranscription } from '@vocalstack/js-sdk';

const sdk = new LiveTranscription({ apiKey: 'YOUR-API-KEY' });

const stream = await sdk.connect({
  // Optional: Integrate this stream with a Polyglot session
  polyglot_id: 'YOUR-POLYGLOT-SESSION-ID',
  // Optional: language of the speech spoken
  // (this can be used to improve the transcription accuracy)
  language: 'en',
  // Optional: Translate the transcription to these languages
  translations: ['de'],
  // Optional: Stop the stream after this many seconds of inactivity
  timeout_period_s: 60,
  // Optional: Hard stop the stream after this many seconds
  max_duration_s: 300,
});

// Start the stream
stream.start();

// Get audio data from a microphone and send it to the stream
// stream.sendBuffer(buffer);
// *** This is a placeholder for the actual implementation ***

// Manually stop the stream (in this example, after 60 seconds)
// If max_duration_s is set, stopping the stream is optional
setTimeout(() => stream.stop(), 60000);

// Listen for stream transcription data
stream.onData((response) => {
  const { status, data } = response;
  console.log(status); // 'waiting', 'processing', 'done', 'stopping' or 'error'
  if (data) {
    console.log(data.timeline); // an object with the transcription timeline
  }
  if (status === 'done') {
    console.log(data.summary); // a summary of the transcription
    console.log(data.keywords); // an array of keywords
    console.log(data.paragraphs); // the entire transcription in paragraph form
  }
});

```

Getting the audio stream data will differ based on the environment where you want to execute the transcription operation. Here are a couple of examples for how you might do this:

### On the Server

In NextJS you should install a package that can fetch audio data from your device, which you can then forward to the VocalStack API. Here is an example:

```js
const mic = require('mic');

// Create a new instance of the microphone utility
const micInstance = mic();

// Get the audio input stream
const micStream = micInstance.getAudioStream();

// Capture the audio data from the microphone
micStream.on('data', (data) => {
  stream.sendBuffer(data); // send the buffer data to the VocalStack API
});

// Start capturing audio from the microphone
micInstance.start();

```

### On the Web Browser

On the web browser you may want to use the `MediaRecorder` API as can be seen in the following example. (It may also be a good idea to use a package like `recordrtc` which improves browser compatibility) 

```js
// Request access to the microphone
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

// Create a MediaRecorder instance to capture audio data
const mediaRecorder = new MediaRecorder(mediaStream);

// Event handler to process audio data packets
mediaRecorder.ondataavailable = async (event) => {
  const blob = event.data; // this is the audio packet (Blob)
  const buffer = await blob.arrayBuffer(); // convert the Blob to a Buffer
  stream.sendBuffer(buffer); // send the buffer data to the VocalStack API
};

// Start capturing audio, and send it to the stream every second
mediaRecorder.start(1000);

```

Note that for access to the VocalStack API on web clients you will need to use an auth token:

[Client Side Authentication Tokens](transcribe-on-the-front-end-with-auth-tokens.md) - Create a temporary authentication token for client side requests. Safely implement API requests in web browsers without exposing your API keys.




## Transcribe from an HLS LiveStream

VocalStack API can be used to transcribe any HLS LiveStream URL, including sources such as Youtube Live, Facebook Live, and Twitch. Please note that the stream URL must be a `.m3u8` file extension that represents a valid HLS (HTTP Live Streaming) playlist file.

```js
import { LiveTranscription } from '@vocalstack/js-sdk';

const sdk = new LiveTranscription({ apiKey: 'YOUR-API-KEY' });

const stream = await sdk.connect({
  // must be a valid HLS streaming protocol
  livestream_url:
    'http://a.files.bbci.co.uk/media/live/manifesto/audio/simulcast/hls/nonuk/sbr_low/ak/bbc_world_service.m3u8',

  // The rest of these options are the same as for microphone live transcriptons
});

stream.start();

stream.onData((response) => {
  // The response object is the same as the one
  // returned by microphone transcriptions
});

```



## Integration with Polyglot

Integrating live transcriptions with Polyglot is as simple as adding a `polyglot_id` option to the transcription request, as demonstrated in the examples above. 

### Benefits

Polyglot creates a public shareable link associated with your transcriptions (the link can be password protected):

  - Users can read your transcription in real time using the link.

  - Users can choose the language in which to read the transcription in real time.

  - Users can read your transcription at a later time, and all other transcriptions integrated with your particular Polyglot session.

### White labeling

You are welcome to use the VocalStack API and implement your own white labelled UI instead of using the one provided by VocalStack. We would love to hear about it if you do, so we can learn about how to make our product better! 

### Learn More



Learn more about how Polyglot works at vocalstack.com/polyglot.



## Next Steps

[Transcribe and Present a Polyglot Session](transcribe-and-present-a-polyglot-session.md) - Create a session that can be used to broadcast a live transcription via a public shareable link. Users can read live transcriptions in their preferred language, and even past transcriptions when your session is inactive.


[Get Transcription Data](get-transcription-data.md) - Get data from pending or completed transcriptions. This includes the transcription timeline, key words, summary, and paragraph segments.


[Client Side Authentication Tokens](transcribe-on-the-front-end-with-auth-tokens.md) - Create a temporary authentication token for client side requests. Safely implement API requests in web browsers without exposing your API keys.



[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcribe-from-a-microphone-or-live-stream)

