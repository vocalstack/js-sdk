[![](/logo.svg 'VocalStack')](https://www.vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcribe-on-the-front-end-with-auth-tokens)

# Client Side Authentication Tokens

> Create a temporary authentication token for client side requests. Safely implement API requests in web browsers without exposing your API keys.

## Table of Contents
  - [Generating an Authentication Token](#generating-an-authentication-token)
  - [Using an Authentication Token](#using-an-authentication-token)
  - [Security Considerations](#security-considerations)

Authentication tokens are an essential security measure in client environments where you require VocalStack API services. You will require this when implementing API requests in web browsers, apps or any other public environments.

## Generating an Authentication Token

On the server side we can use the SDK to generate an auth token. By default, the options for the token are restrictive. You may want to update these to suit your requirements:

  - `access`: Either "readonly" or "readwrite". The former enables you to execute API calls that return data. The later enables you to also execute API requests that includes billable transcription related operations. The default value for this option is *"readonly"*. 

  - `lifetime_s`: A number between 1 and 120 representing the lifetime of the token in seconds. After this period, the token will expire and will no longer be useable. Note that this will not affect asynchronous requests that have already started using this token. (In other words, once an asynchronous request has started, it will run to completion even if the token has expired after the request has started.) The default value for this option is *10*. 

  - `one_time`: A boolean signifying whether this API token is meant for a single use. If true, once this token has been used for an API request, it will expire. The default value for this option is *true*. 

Here is what this will look like on your server:

```js
import { Security } from '@vocalstack/js-sdk';

const sdk = new Security({ apiKey: 'YOUR-API-KEY' });

const authToken = await sdk.generateToken({
  access: 'readwrite', // Optional: 'readonly' or 'readwrite'
  lifetime_s: 60, // Optional: 1-120 seconds
  one_time: true, // Optional: true or false
});

// Next, return the token to the client where API request will be made.
// Make sure to keep the token secure and do not expose it to the public.

```

You will need to setup a mechanism for serving your server generated API token to your client. This will depend largely on your infrastructure and tech stack. Make sure you implement security best practices. For example, you should not create an API endpoint that serves generated API tokens to unauthenticated requests.

## Using an Authentication Token

Consuming the VocalStack API on the client side requires you to use an `authToken` setting instead of an `apiKey`. For example, consider the documentation for [Transcribe Audio from URL](transcribe-audio-from-url-to-text.md)
.

In this example simply replace:

`{ apiKey: 'YOUR-API-KEY' }` with  `{ authToken: 'YOUR-AUTH-TOKEN' }` 👇

```js
import { UrlTranscription } from '@vocalstack/js-sdk';

const authToken = await fetch('http://example.com/your-secured-api/authenticate')
  .then((response) => response.json())
  .then((data) => data.token);

const sdk = new UrlTranscription({ authToken });
const transcription = await sdk.connect({ url: 'http://example.com/speech.mp3' });

transcription.start();

```

## Security Considerations

When generating and serving client-side authentication tokens, it’s crucial to implement strict security measures to prevent unauthorized access to your API. Tokens are powerful tools for accessing resources and services, and if they are not protected, they can be misused. You must ensure that only authorized clients can request and use tokens, and you should never expose sensitive data such as API keys in a public environment. Failure to do so could result in data breaches, unauthorized access to resources, or unintended charges for billable services.

To help secure your implementation, consider the following best practices:

  - Never Expose Your API Keys on the Client Side: API keys should always remain confidential and be stored securely on the server. Exposing them in client-side code (e.g. JavaScript, HTML) can lead to unauthorized access to the API.

  - Use Secure Server-Side Token Generation: Always generate authentication tokens on the server side to prevent exposure of API keys in client code.

  - Authenticate Requests for Tokens: Ensure that only authenticated users or services can request an API token by enforcing authentication mechanisms (e.g., OAuth, session validation).

  - Implement HTTPS: Always serve tokens over HTTPS to protect against man-in-the-middle attacks.

  - Avoid Exposing Tokens in URLs: Never pass tokens in URL query parameters as they could be logged in server logs or exposed in browser history.

  - Restrict Token Scope: Limit tokens to the minimum necessary permissions, such as read-only access unless write access is explicitly required.

  - Set Token Expiration: Use short token lifetimes to reduce the risk of token misuse. Consider limiting token lifetimes based on usage patterns and security needs.

  - Enable One-Time Use Tokens: If possible, use one-time tokens for especially sensitive actions to ensure they cannot be reused.


[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcribe-on-the-front-end-with-auth-tokens)

