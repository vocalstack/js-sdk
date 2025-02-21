[![](/logo.svg 'VocalStack')](https://www.vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcription-sessions)

# Transcription Sessions

> Monitor and manage transcription state with sessions. Using sessions you can reconnect to a previously created asynchronous connection.



Sessions can be useful if you want to want to programatically monitor a transcription in real time in a context other than where the transcription was first created.

A new session is created each time you successfully call `connect`. The session ends only when the transcription ends with a state of "done" or "error". Subsequent calls to `connect` with the same transcription request options will return a `transcription` object for the same transcription connection. 

So, for example:

```js
// Process 1:

import { UrlTranscription } from '@vocalstack/js-sdk';

const sdk = new UrlTranscription({ apiKey: 'YOUR-API-KEY' });
const transcription = await sdk.connect({ file: 'speech.mp3' });

transcription.start();

// Process 2:

import { UrlTranscription } from '@vocalstack/js-sdk';

const sdk = new UrlTranscription({ apiKey: 'YOUR-API-KEY' });
const transcription = await sdk.connect({ file: 'speech.mp3' });

transcription.onData((response) => {
  console.log(response.data);
});

```


[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcription-sessions)

