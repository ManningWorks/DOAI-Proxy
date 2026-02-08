### POSTChat completion (v.2)

https://api.straico.com/v2/chat/completions

## Overview

This is an OpenAI compatible endpoint which let users generate chat completions from a provided message history.

## Authentication

All requests must include an `Authorization` header with a valid API key.

## Request Headers

- Authorization: `Bearer $STRAICO_API_KEY`
    
- Content-Type: `application/json` or `application/x-www-form-urlencoded`
    

## Request Body

- You must choose between including either `model` or `smart_llm_selector`; you can't include or omit both fields at the same time.

| Parameter               | Type    | Required | Description                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`                 | string  | No       | Specifies the model for generating the prompt completion                                                                                                                                                                                                                                                                                |
| `smart_llm_selector`    | string  | No       | The possible values for this string are: "`quality`", "`balance`", or "`budget`".  <br>  <br>If provided, an AI will select a model whose advantages, features and applications best match the user's needs based on the prompt. It will also choose a cheaper, balanced, or expensive model according to the specified pricing method. |
| `messages`              | Array   | Yes      | An array of objects containing role and content. The content field is itself an array of objects with type and text (see request examples). This array should include the entire conversation you want to provide as context, with the last message serving as the current task for the LLM.                                            |
| `temperature`           | number  | No       | This setting influences the variety in the model's responses (0-2)                                                                                                                                                                                                                                                                      |
| `max_tokens`            | number  | No       | Set the limit for the number of tokens the model can generate in response                                                                                                                                                                                                                                                               |
| `replace_failed_models` | boolean | No       | When enabled, and only if the selected model fails due to availability issues, another model will be chosen based on similar applications and a similar price to the original one.                                                                                                                                                      |
## Response

Upon a successful request, the API responds with a JSON object containing the generated prompt completion and additional details.

|Field|Type|Description|
|---|---|---|
|`price`|object|Cost breakdown. Contains `input`, `output`, and `total` coins|
|`words`|object|Word count details. Contains `input`, `output`, and `total` words|
|`usage`|object|Token count details. Contains `prompt_tokens`, `completion_tokens`, `total_tokens` and `prompt_tokens_details`|
|`choices`|array|Detailed result for the chat completion generated|
|`model_selector_justification`|string|A detailed justification of the smart_llm_selector decision, if it was used.|

```json
{
"model": "meta-llama/llama-4-maverick",
"messages": [
       {
        "role": "user",
        "content": [
            {"type": "text", "text": "solve for x => 10x -4x = 0"},
            {
                "type": "image_url",
                "image_url":{
                    "url": "https://straico.com/wp-content/uploads/2024/11/logo_straico.png"
                } 
            }
        ]
      },
      {
        "role": "assistant",
        "content": "To solve for x, we need to simplify the equation.\n\nThe given equation is:\n10x - 4x + 2 = 0\n\nFirst, combine the like terms:\n(10x - 4x) + 2 = 0\n6x + 2 = 0\n\nNext, isolate x by subtracting 2 from both sides:\n6x = -2\n\nNow, divide both sides by 6:\nx = -2/6\n\nSimplify the fraction:\nx = -1/3\n\nSo, the solution is x = -1/3."
            },
        {
        "role": "user",
        "content": [{"type": "text", "text": "How much is x times 2"}
        ]
      }
    ]
  }
```

