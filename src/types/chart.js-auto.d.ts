declare module 'chart.js/auto' {
  export interface ChartConfiguration {
    type: string;
    data: unknown;
    options?: unknown;
  }
  export default class Chart {
    constructor(context: CanvasRenderingContext2D, config: ChartConfiguration);
    destroy(): void;
  }
}
