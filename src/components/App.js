import React from "react";
import Client from "../bidi-client/client.js";
import ConnectionContainer from "./ConnectionContainer";
import Console from "./Console";
import { formatConsoleOutput } from "../format-utils/index.js";

import "./App.css";

const MESSAGE_TYPE = {
  LOG: "log",
  DIR: "dir",
  TABLE: "table",
  TRACE: "trace",
  CLEAR: "clear",
  START_GROUP: "startGroup",
  START_GROUP_COLLAPSED: "startGroupCollapsed",
  END_GROUP: "endGroup",
  CONTENT_BLOCKING_GROUP: "contentBlockingWarningGroup",
  STORAGE_ISOLATION_GROUP: "storageIsolationWarningGroup",
  TRACKING_PROTECTION_GROUP: "trackingProtectionWarningGroup",
  COOKIE_SAMESITE_GROUP: "cookieSameSiteGroup",
  CORS_GROUP: "CORSWarningGroup",
  CSP_GROUP: "CSPWarningGroup",
  ASSERT: "assert",
  DEBUG: "debug",
  PROFILE: "profile",
  PROFILE_END: "profileEnd",
  // Undocumented in Chrome RDP, but is used for evaluation results.
  RESULT: "result",
  // Undocumented in Chrome RDP, but is used for input.
  COMMAND: "command",
  // Undocumented in Chrome RDP, but is used for messages that should not
  // output anything (e.g. `console.time()` calls).
  NULL_MESSAGE: "nullMessage",
  NAVIGATION_MARKER: "navigationMarker",
  SIMPLE_TABLE: "simpleTable",
};
const MESSAGE_LEVEL = {
  LOG: "log",
  ERROR: "error",
  WARN: "warn",
  DEBUG: "debug",
  INFO: "info",
};

class App extends React.Component {
  #client;
  #isReconnecting;
  #topBrowsingContextId;

  constructor(props) {
    super(props);

    this.state = {
      consoleInput: "",
      consoleOutput: [],
      isClientReady: false,
      isConnectButtonDisabled: false,
      isConnectingToExistingSession: false,
      host: "localhost:9222",
    };

    this.#client = new Client();
    this.#client.on("websocket-close", this.#onWebsocketClose);
    this.#client.on("websocket-open", this.#onWebsocketOpen);
    this.#client.on("websocket-message", this.#onWebsocketMessage);

    this.#isReconnecting = false;
  }

  componentDidMount() {
    const sessionId = localStorage.getItem("sessionId");
    if (sessionId) {
      // XXX: ReactStrictMode mounts the components twice. Since this component
      // owns the client, it makes sense to let it drive the reconnection.
      // This dirty workaround avoids attempting two connections at once.
      if (this.#isReconnecting) {
        return false;
      }
      this.#isReconnecting = true;

      console.log("Attempt to reconnect to session id:", sessionId);
      this.setState({
        isConnectingToExistingSession: true,
      });
      this.#client.connect(this.state.host, sessionId);
    }
  }

  connectClient = () => {
    console.log("Attempt to create a connection to a new session");
    this.setState({
      isConnectingToExistingSession: false,
    });
    this.#client.connect(this.state.host);
  };

  #onWebsocketClose = () => {
    this.setState({
      isClientReady: false,
      isConnectButtonDisabled: false,
    });
  };

  #onWebsocketMessage = (_, data) => {
    console.log({ data });
    // Track only log.entryAdded event
    if (data.method === "log.entryAdded") {
      // Extend to support not only log messages
      this.setState({
        consoleOutput: [
          ...this.state.consoleOutput,
          {
            id: data.params.timestamp,
            message: data.params.text,
            type: data.params.type,
            level: data.params.level,
          },
        ],
      });
    }
  };

  #onWebsocketOpen = async () => {
    this.setState({
      isConnectButtonDisabled: true,
    });

    const sessionStatusResponse = await this.#client.sendCommand(
      "session.status",
      {}
    );

    // If we connected to an existing session, status `ready` will be false.
    // Only attempt to create a new session if `ready` is true.
    const canCreateNewSession = sessionStatusResponse.result.ready;
    const { isConnectingToExistingSession } = this.state;
    if (!canCreateNewSession && !isConnectingToExistingSession) {
      console.log(
        "Unable to establish a new connection or to reuse an existing one," +
          " please restart the target Firefox and reconnect"
      );
      return;
    }

    if (canCreateNewSession) {
      console.log("Creating a new session");
      const sessionNewResponse = await this.#client.sendCommand(
        "session.new",
        {}
      );

      // Store the session id
      const sessionId = sessionNewResponse.result.sessionId;
      localStorage.setItem("sessionId", sessionId);
    }

    // XXX: For existing sessions, we already subscribed to this in theory.
    // We could skip it, but we have no way to check if we are already
    // subscribed. We could also unsubscribe/subscribe.
    this.#client.sendCommand("session.subscribe", {
      events: ["log.entryAdded"],
    });

    const responce = await this.#client.sendCommand(
      "browsingContext.getTree",
      {}
    );
    this.#topBrowsingContextId = responce.result.contexts[0].context;
    this.setState({
      isClientReady: true,
    });
  };

  onConsoleSubmit = async (event) => {
    event.preventDefault();
    this.setState({
      consoleOutput: [
        ...this.state.consoleOutput,
        {
          id: this.state.consoleInput,
          message: this.state.consoleInput,
          type: MESSAGE_TYPE.COMMAND,
        },
      ],
    });
    const responce = await this.#client.sendCommand("script.evaluate", {
      expression: this.state.consoleInput,
      awaitPromise: false,
      target: {
        context: this.#topBrowsingContextId,
      },
    });

    this.setState({
      consoleOutput: [
        ...this.state.consoleOutput,
        {
          id: responce.id,
          message: responce.result.result
            ? formatConsoleOutput(responce.result.result)
            : responce.result.exceptionDetails.text,
          type: MESSAGE_TYPE.RESULT,
          level: responce.result.result
            ? MESSAGE_LEVEL.LOG
            : MESSAGE_LEVEL.ERROR,
        },
      ],
    });
  };

  onInputChange = (event) => {
    this.setState({ [event.target.name]: event.target.value });
  };

  render() {
    const {
      consoleInput,
      consoleOutput,
      isClientReady,
      isConnectButtonDisabled,
      host,
    } = this.state;
    return (
      <div>
        <h3>BiDi WebConsole Prototype</h3>
        <div className="wrapper">
          <ConnectionContainer
            isConnectButtonDisabled={isConnectButtonDisabled}
            host={host}
            onClick={this.connectClient}
            onInputChange={this.onInputChange}
          />
          <Console
            consoleOutput={consoleOutput}
            consoleInput={consoleInput}
            isClientReady={isClientReady}
            onSubmit={this.onConsoleSubmit}
            onChange={this.onInputChange}
          />
        </div>
      </div>
    );
  }
}

export default App;
