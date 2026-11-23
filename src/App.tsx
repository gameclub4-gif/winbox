// @ts-nocheck
import { Component } from "react";
import "./win95.css";
import "./apps.css";
import { OSProvider } from "./os/OS.jsx";
import Desktop from "./os/Desktop.jsx";

class Root extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#008080", display: "flex", alignItems: "center", justifyContent: "center", font: "12px Tahoma, Arial" }}>
          <div style={{ background: "#c0c0c0", padding: 16, border: "2px outset #fff", maxWidth: 420 }}>
            <b>Windows 95 - Fatal Exception</b>
            <p>An error has occurred. Press the button to restart Windows.</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.err.message)}</pre>
            <button onClick={() => location.reload()}>Restart</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <Root>
      <OSProvider>
        <Desktop />
      </OSProvider>
    </Root>
  );
}
