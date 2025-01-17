import ConsoleInput from "./ConsoleInput";
import ConsoleOutput from "./ConsoleOutput";
import "./Console.css";

const Console = ({
  consoleOutput,
  consoleValue,
  isClientReady,
  onChange,
  onSubmit,
}) => {
  if (!isClientReady) {
    return null;
  }

  return (
    <div className="flexible-output-input">
      <ConsoleOutput messages={consoleOutput} />
      <ConsoleInput
        onChange={onChange}
        onSubmit={onSubmit}
        value={consoleValue}
      />
    </div>
  );
};

export default Console;
