// @ts-nocheck
function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

/*
  JSON structure chosen: tree of nodes, each with a `type` field.

  Node types:
    { type: "document",  children: [...] }            — root wrapper
    { type: "doctype",   value: "html" }               — <!DOCTYPE html>
    { type: "comment",   value: "..." }                — <!-- ... -->
    { type: "text",      value: "..." }                — bare text content
    { type: "element",   tag: "div",
                         attributes: { key: value },  — string value or true for booleans
                         children: [...] }

  Design rationale:
  - A tree mirrors how the browser sees HTML, making it intuitive to traverse.
  - Separating text/comment/element/doctype into typed nodes avoids ambiguity.
  - Boolean attributes (e.g. `disabled`) are stored as `true` so consumers can
    distinguish them from empty-string attributes.
  - The root is always a `document` node so the output shape is consistent
    regardless of input (fragment, full page, or empty string).

  Parser approach: manual single-pass tokenizer (no DOM, no DOMParser).
  The tokenizer scans for `<` boundaries, classifies each tag, then a tree-builder
  assembles the token stream into the nested structure. Quote-tracking inside
  `findTagEnd` prevents a `>` inside an attribute value from terminating a tag
  prematurely.
*/
function html2json(htmlText) {
  if (typeof htmlText !== "string") return null;

  // Void elements are self-closing by definition in HTML5.
  const VOID_ELEMENTS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
  ]);

  // Content inside these tags must not be parsed as child elements.
  const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

  function decodeEntities(text) {
    return text
      .replace(/&amp;/gi,   "&")
      .replace(/&lt;/gi,    "<")
      .replace(/&gt;/gi,    ">")
      .replace(/&quot;/gi,  '"')
      .replace(/&apos;/gi,  "'")
      .replace(/&nbsp;/gi,  " ")
      .replace(/&copy;/gi,  "©")
      .replace(/&reg;/gi,   "®")
      .replace(/&trade;/gi, "™")
      .replace(/&mdash;/gi, "—")
      .replace(/&ndash;/gi, "–")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#([0-9]+);/g,       (_, d) => String.fromCodePoint(parseInt(d, 10)));
  }

  // Find the closing `>` of a tag, skipping `>` inside quoted attribute values.
  function findTagEnd(html, start) {
    let inSingle = false, inDouble = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if      (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === ">" && !inSingle && !inDouble) return i;
    }
    return -1;
  }

  function parseAttributes(str) {
    const attrs = {};
    // Matches: key, key="val", key='val', key=unquoted
    const re = /([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      const val = m[2] !== undefined ? m[2]
                : m[3] !== undefined ? m[3]
                : m[4] !== undefined ? m[4]
                : true;
      attrs[m[1]] = val === true ? true : decodeEntities(String(val));
    }
    return attrs;
  }

  function parseOpenTag(raw) {
    const s = raw.trim();
    const spaceIdx = s.search(/[\s/]/);
    if (spaceIdx === -1) return { tag: s.toLowerCase(), attributes: {} };
    return {
      tag: s.slice(0, spaceIdx).toLowerCase(),
      attributes: parseAttributes(s.slice(spaceIdx)),
    };
  }

  function tokenize(html) {
    const tokens = [];
    let i = 0;

    while (i < html.length) {
      // ── Text node ─────────────────────────────────────────────────────────
      if (html[i] !== "<") {
        const end = html.indexOf("<", i);
        const raw = end === -1 ? html.slice(i) : html.slice(i, end);
        const text = raw.trim();
        if (text) tokens.push({ type: "text", value: decodeEntities(text) });
        i = end === -1 ? html.length : end;
        continue;
      }

      // ── Comment <!-- ... --> ───────────────────────────────────────────────
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        const value = (end === -1 ? html.slice(i + 4) : html.slice(i + 4, end)).trim();
        tokens.push({ type: "comment", value });
        i = end === -1 ? html.length : end + 3;
        continue;
      }

      // ── DOCTYPE ────────────────────────────────────────────────────────────
      if (html.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
        const end = html.indexOf(">", i);
        if (end !== -1) {
          tokens.push({ type: "doctype", value: html.slice(i + 9, end).trim() });
        }
        i = end === -1 ? html.length : end + 1;
        continue;
      }

      // ── Closing tag </tag> ─────────────────────────────────────────────────
      if (html[i + 1] === "/") {
        const end = html.indexOf(">", i);
        const tag = (end === -1 ? html.slice(i + 2) : html.slice(i + 2, end)).trim().toLowerCase();
        if (tag) tokens.push({ type: "closeTag", tag });
        i = end === -1 ? html.length : end + 1;
        continue;
      }

      // ── Opening or self-closing tag ────────────────────────────────────────
      const tagEnd = findTagEnd(html, i + 1);
      if (tagEnd === -1) { i = html.length; continue; }

      const rawContent = html.slice(i + 1, tagEnd);
      const selfClosing = rawContent.trimEnd().endsWith("/");
      const { tag, attributes } = parseOpenTag(
        selfClosing ? rawContent.trimEnd().slice(0, -1) : rawContent
      );

      if (!tag) { i = tagEnd + 1; continue; }

      if (VOID_ELEMENTS.has(tag) || selfClosing) {
        tokens.push({ type: "selfClosingTag", tag, attributes });
        i = tagEnd + 1;
        continue;
      }

      tokens.push({ type: "openTag", tag, attributes });
      i = tagEnd + 1;

      // Raw text content — do not parse inner markup as child elements.
      if (RAW_TEXT_ELEMENTS.has(tag)) {
        const closeIdx = html.toLowerCase().indexOf(`</${tag}`, i);
        const rawText = (closeIdx === -1 ? html.slice(i) : html.slice(i, closeIdx)).trim();
        if (rawText) tokens.push({ type: "text", value: rawText });
        if (closeIdx !== -1) {
          const closeEnd = html.indexOf(">", closeIdx);
          tokens.push({ type: "closeTag", tag });
          i = closeEnd === -1 ? html.length : closeEnd + 1;
        } else {
          i = html.length;
        }
      }
    }

    return tokens;
  }

  function buildTree(tokens) {
    const root = { type: "document", children: [] };
    const stack = [root];

    for (const token of tokens) {
      const parent = stack[stack.length - 1];

      if (token.type === "openTag") {
        const node = {
          type: "element",
          tag: token.tag,
          attributes: token.attributes,
          children: [],
        };
        parent.children.push(node);
        stack.push(node);

      } else if (token.type === "closeTag") {
        // Walk backwards to find the matching open tag, implicitly closing any
        // unclosed elements in between (mirrors browser error recovery).
        for (let j = stack.length - 1; j > 0; j--) {
          if (stack[j].tag === token.tag) { stack.splice(j); break; }
        }

      } else if (token.type === "selfClosingTag") {
        parent.children.push({
          type: "element",
          tag: token.tag,
          attributes: token.attributes,
          children: [],
        });

      } else if (token.type === "text") {
        parent.children.push({ type: "text", value: token.value });

      } else if (token.type === "comment") {
        parent.children.push({ type: "comment", value: token.value });

      } else if (token.type === "doctype") {
        parent.children.push({ type: "doctype", value: token.value });
      }
    }

    return root;
  }

  try {
    return buildTree(tokenize(htmlText));
  } catch (_) {
    // Never crash — return an empty document on any unexpected error.
    return { type: "document", children: [] };
  }
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}
