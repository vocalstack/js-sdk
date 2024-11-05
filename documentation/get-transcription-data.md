[![](/logo.svg 'VocalStack')](https://vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://vocalstack.com/documentation/get-transcription-data)

# Get Transcription Data

> Get data from pending or completed transcriptions. This includes the transcription timeline, key words, summary, and paragraph segments.

## Table of Contents
  - [Getting all the Transcriptions](#getting-all-the-transcriptions)
  - [Getting a Single Transcription](#getting-a-single-transcription)
    - [Pending Transcriptions](#pending-transcriptions)
    - [Completed Transcriptions](#completed-transcriptions)
  - [Next Steps](#next-steps)

You can use the VocalStack API to fetch transcription data once you have started transcribing audio with any of the following methods:

[Transcribe Audio from URL](transcribe-audio-from-url-to-text.md) - Transcribe speech from pre-recorded audio in a URL to plain text. Major file formats are supported, including MP3, WAV, FLAC, and OGG.


[Transcribe from a Microphone or LiveStream](transcribe-from-a-microphone-or-live-stream.md) - Transcribe live speech from a microphone or live stream. Integrate with Polyglot to create a public shareable link for the transcription which users can read in any language. 


[Transcribe and Present a Polyglot Session](transcribe-and-present-a-polyglot-session.md) - Create a session that can be used to broadcast a live transcription via a public shareable link. Users can read live transcriptions in their preferred language, and even past transcriptions when your session is inactive.


## Getting all the Transcriptions

Getting all of the transcriptions is accomplished using `Transcriptions` from the VocalStack SDK:

```js
import { Transcriptions } from '@vocalstack/js-sdk';

const sdk = new Transcriptions({ apiKey: 'YOUR-API-KEY' });
const transcriptions = await sdk.getAllTranscriptions();

transcriptions.data?.forEach((transcription) => {
  // the transcription ID (use this to get more details about the transcription)
  console.log(transcription.id);
  
  // 'waiting', 'processing', 'done', or 'error'
  console.log(transcription.status);

  // the time the transcription started
  console.log(transcription.start);

  // the time the transcription finalized
  console.log(transcription.end); 

  // the keywords associated with the transcription
  console.log(transcription.keywords);
  
  // the length of the transcription in seconds
  console.log(transcription.duration);
});

```

## Getting a Single Transcription

To get all the data available for a transcription we must use the `id` of that transcription. The `id` is returned whenever a transcription process is first initiated. However, it can also be obtained by looking at all of the transcriptions using the API above. 

To get a specific transcription use `Transcriptions` from the VocalStack SDK:

```js
import { Transcriptions } from '@vocalstack/js-sdk';

const sdk = new Transcriptions({ apiKey: 'YOUR-API-KEY' });
const transcription = await sdk.getTranscription({ id: 'TRANSCRIPTION-ID' });
const data = transcription.data;

if (data) {
  // the transcription ID (use this to get more details about the transcription)
  console.log(data.id);

  // 'waiting', 'processing', 'done', or 'error'
  console.log(data.status);

  // the time the transcription started
  console.log(data.start);

  // the time the transcription finalized
  console.log(data.end);

  // the keywords associated with the transcription
  console.log(data.keywords);

  // the length of the transcription in seconds
  console.log(data.duration);

  // an object with the transcription timeline
  console.log(data.timeline);

  // a summary of the transcription
  console.log(data.summary);

  // the entire transcription in paragraph form
  console.log(data.paragraphs);
}

```

### Pending Transcriptions

In most scenarios you would only be interested in getting data for a single transcription once that transcription has finished processing. That is because transcriptions are asynchronous operations that can have their progress monitored asynchronously where you execute that transcription process. However, if you request transcription data for a transcription that is still pending, you will still get all the data available for that transcription, including the most updated `timeline`.

### Completed Transcriptions

Once a transcription is complete, it has undergone post-processing, and in this case the transcription data will also contain values for `keywords`, `summary` and `paragraphs`.



## Next Steps

Review the response object returned with each transcription:

[Transcription Request and Response](transcription-request-and-response.md) - Common request options and responses for all transcription operations. Use options to configure the transcription settings.



[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://vocalstack.com/documentation/get-transcription-data)

