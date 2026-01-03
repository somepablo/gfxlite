import { defineConfig } from "vitepress";
import path from "path";

export default defineConfig({
  title: "GFXLite",
  description: "Modern 3D Renderer for the Web",
  ignoreDeadLinks: true,

  head: [["link", { rel: "icon", href: "/favicon.ico" }]],

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      /*{ text: "Examples", link: "/examples/hello-cube" },*/
      /*{ text: "API", link: "/api/" },*/
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Basic Scene", link: "/guide/basic-scene" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Scene Graph", link: "/guide/scene-graph" },
            { text: "Cameras", link: "/guide/cameras" },
            { text: "Geometries", link: "/guide/geometries" },
            { text: "Materials", link: "/guide/materials" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Lighting & Shadows", link: "/guide/lighting" },
            { text: "Textures", link: "/guide/textures" },
            { text: "Environment Maps", link: "/guide/environment" },
            { text: "GLTF Loading", link: "/guide/gltf" },
          ],
        },
      ],
      /*"/examples/": [
        {
          text: "Basic",
          items: [
            { text: "Hello Cube", link: "/examples/hello-cube" },
            { text: "Geometries", link: "/examples/geometries" },
            { text: "Materials", link: "/examples/materials" },
          ],
        },
        {
          text: "Intermediate",
          items: [
            { text: "Lighting", link: "/examples/lighting" },
            { text: "Textures", link: "/examples/textures" },
            { text: "Orbit Controls", link: "/examples/orbit-controls" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "GLTF Models", link: "/examples/gltf" },
            { text: "Environment Maps", link: "/examples/environment" },
          ],
        },
      ],*/
      /*"/api/": [
        {
          text: "Core",
          items: [
            { text: "Renderer", link: "/api/renderer" },
            { text: "Scene", link: "/api/scene" },
            { text: "Object3D", link: "/api/object3d" },
            { text: "Mesh", link: "/api/mesh" },
          ],
        },
        {
          text: "Cameras",
          items: [
            { text: "PerspectiveCamera", link: "/api/perspective-camera" },
            { text: "OrthographicCamera", link: "/api/orthographic-camera" },
          ],
        },
        {
          text: "Materials",
          items: [
            { text: "BasicMaterial", link: "/api/basic-material" },
            { text: "LambertMaterial", link: "/api/lambert-material" },
            { text: "PhongMaterial", link: "/api/phong-material" },
            { text: "StandardMaterial", link: "/api/standard-material" },
          ],
        },
        {
          text: "Geometries",
          items: [{ text: "Geometries", link: "/api/geometries" }],
        },
      ],*/
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/somepablo/gfxlite" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2025-present Pablo Soto",
    },

    search: {
      provider: "local",
    },
  },

  vite: {
    resolve: {
      alias: {
        gfxlite: path.resolve(__dirname, "../../src/index.ts"),
      },
    },
  },
});
