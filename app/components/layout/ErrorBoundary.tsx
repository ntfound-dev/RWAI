"use client";

import { Component, ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", fontSize: 13 }}>
          <div style={{ color: "var(--warn, #f59e0b)", marginBottom: 8 }}>⚠ App error</div>
          <div style={{ color: "var(--fg-2, #666)" }}>{this.state.message}</div>
          <button
            style={{ marginTop: 16, padding: "6px 14px", cursor: "pointer" }}
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
