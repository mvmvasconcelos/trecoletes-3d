/**
 * Minimal ambient typings for `clipper-lib` (v6.4.2, installed under
 * node_modules/clipper-lib) — this package ships no `.d.ts` and there is no
 * `@types/clipper-lib` package, so TypeScript has nothing to go on for
 * `import ClipperLib from 'clipper-lib'` without this.
 *
 * Only the API surface actually used by lib/polygonOffset.ts is declared.
 * Verified against the installed source (node_modules/clipper-lib/clipper.js):
 * this version exposes the modern `ClipperOffset` class (constructor +
 * AddPath/AddPaths + Execute(solution, delta)) — NOT the older static
 * `Clipper.OffsetPolygons(...)` free-function API some docs/examples online
 * describe for older Clipper ports. `module.exports = ClipperLib` is a single
 * CJS object (JoinType/EndType/ClipperOffset as properties), which Vite's
 * esbuild-based CJS interop exposes as a default export — same pattern this
 * codebase already relies on for `import paper from 'paper'`.
 */
declare module 'clipper-lib' {
    export interface IntPoint {
        X: number;
        Y: number;
    }

    /** A single closed or open polygon: an ordered list of integer vertices. */
    export type Path = IntPoint[];
    /** A batch of polygons, as accepted/returned by ClipperOffset. */
    export type Paths = Path[];

    export class ClipperOffset {
        constructor(miterLimit?: number, arcTolerance?: number);
        AddPath(path: Path, joinType: number, endType: number): void;
        AddPaths(paths: Paths, joinType: number, endType: number): void;
        Execute(solution: Paths, delta: number): void;
        Clear(): void;
    }

    interface ClipperLibStatic {
        ClipperOffset: typeof ClipperOffset;
        JoinType: {
            jtSquare: number;
            jtRound: number;
            jtMiter: number;
        };
        EndType: {
            etOpenSquare: number;
            etOpenRound: number;
            etOpenButt: number;
            etClosedLine: number;
            etClosedPolygon: number;
        };
    }

    const ClipperLib: ClipperLibStatic;
    export default ClipperLib;
}
