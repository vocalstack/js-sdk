[![](/logo.svg 'VocalStack')](https://vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://vocalstack.com/documentation/transcription-request-and-response)

# Transcription Request and Response

> Common request options and responses for all transcription operations. Use options to configure the transcription settings.

## Table of Contents
  - [Transcription Request](#transcription-request)
  - [Transcription Response](#transcription-response)
    - [The Response Object](#the-response-object)
    - [Post-processing](#post-processing)
  - [Typescript Support](#typescript-support)



## Transcription Request

VocalStack will attempt to transcribe your audio using sensible default configuration options.  However, you can further configure your transcription request with the following options:

  - `language`: *The ISO 639-1 language code for the speech.* 
For example "en" (English), or "ro" (Romanian). By default, VocalStack will attempt to transcribe in all languages if this option is not provided. This can be useful for multilingual speech. However, if you know the language of the speech, providing this option can increase the transcription accuracy. 

  - `duration_s`: *The duration, in seconds, of the audio file. *
This option is used as a guard to ensure that your transcription occurs only if the audio file length matches the option duration. By default, this option is ignored, and transcriptions will process regardless of their length. 

  - `max_duration_s`: *The maximum duration that can be transcribed, in seconds.*
Use this option if you want to limit the amount of speech transcribed. Set this to `0` if you would like to process the entire transcription, regardless of its duration (⚠️ use with caution). By default, this option is set to `7200`, ensuring that only the first two hours of the speech are transcribed.

## Transcription Response

You can asynchronously monitor the transcription data as it becomes available using `onData` event handler which provides the `response` object.

### The Response Object

The `response` object has the following properties:

  - `status`: One of "waiting", "processing", "done" or "error"

  - `data.progress`: A value between 0 and 1 signifying the transcription progress percentage

  - `data.timeline`*:* If the status is "processing" or "done" the timeline object will be available, showing the entire transcription available up until that point. The timeline is an array of objects containing these properties:

    - `start`: the start time of the transcription segment

    - `end`: the end time of the transcription segment

    - `text`: the chunk of text in the transcription segment

    - `translations`: a key-value store of language codes in ISO 639-1 and translations (this property is only available if the transcription has at least one translation)

### Post-processing

Once the transcription is complete, post-processing will occur, at which point the final `response` will be sent to `onData`. In the final response, the status of the transcription will be "done", and these new properties will be included in `data`:

  - `keywords`: a few key words representing topics from the transcription

  - `summary`: a single paragraph summary of the entire transcription

  - `paragraphs`: the entire transcription grouped into paragraphs, segmented by themes, or by a meaningful transition to a new topic

## Typescript Support

VocalStack's JavaScript SDK has full TypeScript support. For example, the `response` object has the `UrlTranscriptionResponse` type. 

```js
import { UrlTranscription, UrlTranscriptionResponse } from '@vocalstack/js-sdk';

const sdk = new UrlTranscription({ apiKey: 'YOUR-API-KEY' });
const transcription = await sdk.start({ url: 'http://example.com/audio.mp3' });

transcription.onData((response: UrlTranscriptionResponse) => {
  console.log(response.data);
});

```


[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://vocalstack.com/documentation/transcription-request-and-response)

