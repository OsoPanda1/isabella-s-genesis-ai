import { useEffect, useRef, useState, useCallback } from "react";

export interface ComponentMetric {
  componentName: string;
  mountTimeMs: number;
  renderCount: number;
  lastRenderTimeMs: number;
  averageRenderTimeMs: number;
  totalRenderTimeMs: number;
}

export interface EventMetric {
  eventName: string;
  durationMs: number;
  timestamp: string;
}

class PerformanceRegistry {
  private componentMetrics = new Map<string, ComponentMetric>();
  private eventMetrics: EventMetric[] = [];
  private listeners = new Set<() => void>();

  getComponentMetrics(): ComponentMetric[] {
    return Array.from(this.componentMetrics.values());
  }

  getEventMetrics(): EventMetric[] {
    return [...this.eventMetrics];
  }

  recordRender(componentName: string, durationMs: number) {
    const existing = this.componentMetrics.get(componentName);
    if (!existing) {
      this.componentMetrics.set(componentName, {
        componentName,
        mountTimeMs: durationMs,
        renderCount: 1,
        lastRenderTimeMs: durationMs,
        averageRenderTimeMs: durationMs,
        totalRenderTimeMs: durationMs,
      });
    } else {
      const renderCount = existing.renderCount + 1;
      const totalRenderTimeMs = existing.totalRenderTimeMs + durationMs;
      this.componentMetrics.set(componentName, {
        componentName,
        mountTimeMs: existing.mountTimeMs,
        renderCount,
        lastRenderTimeMs: durationMs,
        averageRenderTimeMs: totalRenderTimeMs / renderCount,
        totalRenderTimeMs,
      });
    }
    this.notify();
  }

  recordEvent(eventName: string, durationMs: number) {
    this.eventMetrics.push({
      eventName,
      durationMs,
      timestamp: new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    });
    // Keep last 100 events
    if (this.eventMetrics.length > 100) {
      this.eventMetrics.shift();
    }
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }
}

export const perfRegistry = new PerformanceRegistry();

/**
 * Custom hook to monitor component rendering and event/action duration performance.
 * Records mount times, update counts, render speeds, and tracks asynchronous event latencies.
 */
export function usePerformanceMonitor(componentName: string) {
  const renderCountRef = useRef(0);
  const startTimeRef = useRef(performance.now());

  // Set the start of the render cycle
  startTimeRef.current = performance.now();

  useEffect(() => {
    const duration = performance.now() - startTimeRef.current;
    const isMount = renderCountRef.current === 0;
    renderCountRef.current += 1;

    perfRegistry.recordRender(componentName, duration);

    // Styled console logs following Isabella's aesthetic
    const color = isMount ? "#00FFC2" : "#6E66F9";
    console.log(
      `%c[PERF] ${componentName} %c| ${isMount ? "MOUNT" : "RENDER #" + renderCountRef.current} | %c${duration.toFixed(2)}ms`,
      `color: ${color}; font-weight: bold; font-family: monospace;`,
      "color: #888888; font-family: monospace;",
      "color: #FFF; font-weight: bold; font-family: monospace;",
    );
  });

  const startTrack = useCallback((eventName: string) => {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      perfRegistry.recordEvent(eventName, duration);
      console.log(
        `%c[PERF-EVENT] ${eventName} %c| DURATION | %c${duration.toFixed(2)}ms`,
        "color: #FBBF24; font-weight: bold; font-family: monospace;",
        "color: #888888; font-family: monospace;",
        "color: #FFF; font-weight: bold; font-family: monospace;",
      );
    };
  }, []);

  return {
    startTrack,
  };
}

/**
 * Custom hook to retrieve active performance metrics and subscribe to real-time telemetry updates.
 */
export function usePerformanceStats() {
  const [stats, setStats] = useState(() => perfRegistry.getComponentMetrics());
  const [events, setEvents] = useState(() => perfRegistry.getEventMetrics());

  useEffect(() => {
    return perfRegistry.subscribe(() => {
      setStats(perfRegistry.getComponentMetrics());
      setEvents(perfRegistry.getEventMetrics());
    });
  }, []);

  return { stats, events };
}
