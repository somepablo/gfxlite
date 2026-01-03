import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import HelloCube from "./components/examples/HelloCube.vue";
import GeometriesExample from "./components/examples/GeometriesExample.vue";
import MaterialsExample from "./components/examples/MaterialsExample.vue";
import LightingExample from "./components/examples/LightingExample.vue";
import TexturesExample from "./components/examples/TexturesExample.vue";
import OrbitControlsExample from "./components/examples/OrbitControlsExample.vue";
import SolarSystem from "./components/examples/SolarSystem.vue";
import EnvironmentExample from "./components/examples/EnvironmentExample.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("HelloCube", HelloCube);
    app.component("GeometriesExample", GeometriesExample);
    app.component("MaterialsExample", MaterialsExample);
    app.component("LightingExample", LightingExample);
    app.component("TexturesExample", TexturesExample);
    app.component("OrbitControlsExample", OrbitControlsExample);
    app.component("SolarSystem", SolarSystem);
    app.component("EnvironmentExample", EnvironmentExample);
  },
} satisfies Theme;
