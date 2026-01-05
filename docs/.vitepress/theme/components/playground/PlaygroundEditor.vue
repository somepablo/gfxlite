<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  errorLine: number | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  run: [];
}>();

const editorRef = ref<HTMLDivElement | null>(null);
let editorView: any = null;
let setErrorLine: ((line: number | null) => void) | null = null;

onMounted(async () => {
  if (!editorRef.value || typeof window === "undefined") return;

  const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration } = await import("@codemirror/view");
  const { EditorState, StateField, StateEffect } = await import("@codemirror/state");
  const { defaultKeymap, historyKeymap, history } = await import("@codemirror/commands");
  const { javascript } = await import("@codemirror/lang-javascript");
  const { oneDark } = await import("@codemirror/theme-one-dark");
  const { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } = await import("@codemirror/language");
  const { closeBrackets, closeBracketsKeymap } = await import("@codemirror/autocomplete");

  // Error line highlighting
  const setErrorLineEffect = StateEffect.define<number | null>();

  const errorLineField = StateField.define({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setErrorLineEffect)) {
          const line = effect.value;
          if (line === null || line < 1 || line > tr.state.doc.lines) {
            return Decoration.none;
          }
          const lineInfo = tr.state.doc.line(line);
          const deco = Decoration.line({ class: "cm-error-line" }).range(lineInfo.from);
          return Decoration.set([deco]);
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  setErrorLine = (line: number | null) => {
    if (editorView) {
      editorView.dispatch({
        effects: setErrorLineEffect.of(line),
      });
    }
  };

  const runKeymap = keymap.of([
    {
      key: "Ctrl-s",
      mac: "Cmd-s",
      preventDefault: true,
      run: () => {
        emit("run");
        return true;
      },
    },
  ]);

  const updateListener = EditorView.updateListener.of((update: any) => {
    if (update.docChanged) {
      emit("update:modelValue", update.state.doc.toString());
    }
  });

  const errorLineTheme = EditorView.baseTheme({
    ".cm-error-line": {
      backgroundColor: "rgba(239, 68, 68, 0.2)",
      borderLeft: "3px solid #ef4444",
    },
  });

  editorView = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        javascript(),
        oneDark,
        runKeymap,
        updateListener,
        errorLineField,
        errorLineTheme,
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    }),
    parent: editorRef.value,
  });

  // Set initial error line if present
  if (props.errorLine) {
    setErrorLine(props.errorLine);
  }
});

// Update editor content when modelValue changes externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (editorView && editorView.state.doc.toString() !== newValue) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: newValue,
        },
      });
    }
  }
);

// Watch for error line changes
watch(
  () => props.errorLine,
  (line) => {
    if (setErrorLine) {
      setErrorLine(line);
    }
  }
);

onUnmounted(() => {
  if (editorView) {
    editorView.destroy();
  }
});
</script>

<template>
  <div ref="editorRef" class="playground-editor" />
</template>
