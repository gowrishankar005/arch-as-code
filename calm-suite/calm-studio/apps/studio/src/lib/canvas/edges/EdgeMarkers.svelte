<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  EdgeMarkers.svelte — Shared SVG marker definitions for CALM edge types.
  Rendered ONCE in the canvas DOM (inside SvelteFlow). All edge components
  reference these markers by ID via markerEnd="url(#marker-*)".

  orient="auto-start-reverse" is required on all markers so they rotate
  correctly with edge direction — without it markers point in wrong direction
  on edges with reversed source/target.
-->

<svg id="calm-edge-markers" style="position: absolute; width: 0; height: 0; overflow: hidden;" aria-hidden="true">
  <defs>
    <!-- Filled arrowhead — used by ConnectsEdge and InteractsEdge -->
    <marker
      id="marker-arrow-filled"
      viewBox="0 0 14 10"
      markerWidth="14"
      markerHeight="10"
      refX="13"
      refY="5"
      orient="auto-start-reverse"
    >
      <polygon points="0 0, 14 5, 0 10" fill="currentColor" />
    </marker>

    <!-- Open diamond — used by DeployedInEdge -->
    <marker
      id="marker-diamond-open"
      viewBox="0 0 14 10"
      markerWidth="14"
      markerHeight="10"
      refX="13"
      refY="5"
      orient="auto-start-reverse"
    >
      <polygon
        points="0 5, 7 0, 14 5, 7 10"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </marker>

    <!-- Filled diamond — used by ComposedOfEdge -->
    <marker
      id="marker-diamond-filled"
      viewBox="0 0 14 10"
      markerWidth="14"
      markerHeight="10"
      refX="13"
      refY="5"
      orient="auto-start-reverse"
    >
      <polygon points="0 5, 7 0, 14 5, 7 10" fill="currentColor" />
    </marker>

    <!-- Open arrowhead — used by OptionsEdge -->
    <marker
      id="marker-arrow-open"
      viewBox="0 0 14 10"
      markerWidth="14"
      markerHeight="10"
      refX="13"
      refY="5"
      orient="auto-start-reverse"
    >
      <polyline
        points="0 0, 13 5, 0 10"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </marker>
  </defs>
</svg>
