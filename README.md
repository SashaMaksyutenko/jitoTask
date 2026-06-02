# Jito's Software Development Intern "html2json" Test Task

## Implementation

The `html2json` function is a **manual single-pass tokenizer + tree builder** written in plain JavaScript with no DOM or `DOMParser` usage.

### JSON Structure

Every node in the output has a `type` field. The root is always a `document` node.

```json
{
  "type": "document",
  "children": [
    { "type": "doctype", "value": "html" },
    {
      "type": "element",
      "tag": "div",
      "attributes": { "class": "container", "id": "main" },
      "children": [
        { "type": "text", "value": "Hello" },
        {
          "type": "element",
          "tag": "img",
          "attributes": { "src": "photo.jpg", "alt": "A photo" },
          "children": []
        },
        { "type": "comment", "value": "footer follows" }
      ]
    }
  ]
}
```

**Why this shape:**
- A tree mirrors the DOM directly, so the output is intuitive for anyone familiar with HTML.
- Typed nodes (`text`, `comment`, `doctype`, `element`) remove ambiguity when traversing — no need to guess whether a string key is a tag or a text value.
- Boolean attributes (e.g. `disabled`, `checked`, `required`) are stored as `true` to distinguish them from `attribute=""`.
- The root `document` wrapper means the output shape is always the same regardless of whether the input is a full page, a fragment, or empty.

### How the Parser Works

1. **Tokenizer** — walks the raw HTML string character by character, emitting typed tokens:
   - `doctype`, `comment`, `openTag`, `closeTag`, `selfClosingTag`, `text`
   - `findTagEnd` tracks quote state so a `>` inside an attribute value never terminates a tag early.
   - `RAW_TEXT_ELEMENTS` (`script`, `style`) have their inner content captured as a raw text token — no child-element parsing.

2. **Tree builder** — maintains a stack. `openTag` pushes a new element; `closeTag` pops backwards to the matching tag (implicitly closing any unclosed elements in between, matching browser error recovery). `selfClosingTag`, `text`, `comment`, and `doctype` are appended directly to the current stack top.

### Edge Cases Handled

| Case | How |
|---|---|
| Void elements (`<br>`, `<img>`, `<input>`, …) | `VOID_ELEMENTS` set — treated as self-closing even without `/>` |
| XML-style self-closing (`<Custom />`) | Trailing `/` detection on raw tag content |
| `>` inside attribute values | Quote-aware `findTagEnd` |
| Boolean attributes (`disabled`) | Stored as `true` |
| Unquoted attribute values (`href=#home`) | Regex branch for `[^\s>"']+` |
| HTML entities (`&copy;`, `&#65;`, `&#x41;`) | `decodeEntities` with named + numeric + hex |
| `script` / `style` raw content | Skips to `</script>` / `</style>` without parsing inner markup |
| Unclosed / misnested tags | Stack walks backwards to implicitly close ancestors |
| Stray close tags with no open counterpart | Ignored (stack walk finds no match) |
| Truncated / malformed input | Each token branch handles missing `>` by advancing to end |
| Any unexpected runtime error | Top-level `try/catch` returns `{ type: "document", children: [] }` |
| Non-string input | Guard at the top returns `null` |

## Repository Structure

```
html2json.js           — parser implementation
index.html             — UI shell (unchanged from template)
html_samples/          — HTML files used to test the function
  sample1_full_page.html     — full HTML5 document (task Example 1)
  sample2_simple_fragment.html — simple fragment (task Example 2)
  sample3_edge_cases.html    — entities, booleans, self-closing, comments
  sample4_malformed.html     — unclosed tags, misnested, truncated
  sample5_script_style.html  — raw text elements with JS operators inside
  sample6_table_form.html    — table + form with many input types
ai_help/
  chatgpt_chat.txt     — AI tool used (Claude Code); add conversation link before submitting
```

---

*Original task brief preserved below.*

---

## Original Task Rationale
This task is designed to evaluate how well you solve problems without having every detail explicitly provided and to assess the quality of your deliverables. This type of task isn't necessarily reflective of your future work but aims to help us understand your thought process and reasoning in the context of software development.

## Assignment
Your task is to implement a function called `html2json`, which converts HTML data into a JSON representation.
AI tools usage is <b>REQUIRED</b>. Is is required that you provide your entire conversation history by attaching a link to the dialogue. Therefore, keep all your research within a single conversation and submit the link along with your task.

## Expected repository structure
- `html2json.js` - This file should contain your implementation of the html2json function.
- `html_samples/` folder - Include files with a text that you used as samples to test your function.
- `index.html` - The initial file we provided. You can leave it unchanged, but please include it in the archive.
- `ai_help/` folder - If you used any resources for code generation:
- Create a file named `chatgpt_chat.txt` with a link to the ChatGPT chat used.
- For any other AI resources, attach relevant `.pdf`, `.png`, or `.mp4` files showing how you used them.
- You can optionally update `README.md` completely if you want to add explanations of your reasoning or any other comments.

## Key Points for Evaluation
- Coverage of various HTML structures and different sizes.
- The code <b>MUST NOT</b> crash.
- Code cleanliness and formatting.
- Using a DOM parser is not allowed.
- How effectively you handled unexpected scenarios, such as situations where your code received valid HTML but still crashed or produced incorrect results. We will evaluate your ability to anticipate edge cases and ensure robustness in your solution.

## P.S. from the team
Please focus on quality rather than speed. Quality in this context means ensuring your solution is well thought-out, robust, and free of obvious issues. The speed of delivery will <b>NOT</b> be prioritized, so take the necessary time to research and refine your approach, as long as you complete the task within the specified timeframe.
Before submitting your final results, double or even triple-check everything:
- Verify that all links you provide are accessible in incognito mode, as broken links will result in your submission <b>NOT</b> being reviewed.
- Just before submitting, test your code again to ensure it still functions correctly and handles the html samples without crashing. If your code crashes or fails on your own samples, it will be treated as a failed submission.
- Make sure all items are included according to the [Expected Deliverables](#expected-deliverables) section. If any required files or information are missing, we will <b>NOT</b> be able to review your task, and it will be <ins>treated as failed</ins>.
- Jito's senior developer will thoroughly review your solution. Based on this review, if deemed appropriate, you may be invited for a technical code review. This will include questions about the code, your understanding, and the reasoning behind your solution choices.
- The best indicator that you've done your best is the feeling of confidence when submitting, knowing that you have thoroughly checked your work and cannot think of anything more to improve.
- You can view test task template [here](https://jito-dev.github.io/jito-intern-test-task/)
