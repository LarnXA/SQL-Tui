import { useState } from "react"
import { MainMenu } from "./views/MainMenu"
import { ConnectionList } from "./views/ConnectionList"
import { NewConnectionForm } from "./views/NewConnectionForm"
import { EditConnectionForm } from "./views/EditConnectionForm"
import { Workspace } from "./views/Workspace"
import { loadConnections } from "./store"
import type { Connection } from "./types"

type Screen =
  | { kind: "menu" }
  | { kind: "list"; action: "connect" | "edit" | "delete" }
  | { kind: "new" }
  | { kind: "edit"; id: string }
  | { kind: "workspace"; connection: Connection }

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" })

  return (
    <box style={{ width: "100%", height: "100%", backgroundColor: "#161a22" }}>
      {screen.kind === "menu" && (
        <MainMenu
          onNew={() => setScreen({ kind: "new" })}
          onConnect={() => setScreen({ kind: "list", action: "connect" })}
          onEdit={() => setScreen({ kind: "list", action: "edit" })}
          onDelete={() => setScreen({ kind: "list", action: "delete" })}
          onExit={() => process.exit(0)}
        />
      )}

      {screen.kind === "list" && (
        <ConnectionList
          action={screen.action}
          connections={loadConnections()}
          onBack={() => setScreen({ kind: "menu" })}
          onConnect={(c) => setScreen({ kind: "workspace", connection: c })}
          onEdit={(c) => setScreen({ kind: "edit", id: c.id })}
          onDeleted={() => setScreen({ kind: "menu" })}
        />
      )}

      {screen.kind === "new" && (
        <NewConnectionForm
          onDone={(c) => setScreen({ kind: "workspace", connection: c })}
          onBack={() => setScreen({ kind: "menu" })}
        />
      )}

      {screen.kind === "edit" && (
        <EditConnectionForm
          id={screen.id}
          onDone={() => setScreen({ kind: "menu" })}
          onBack={() => setScreen({ kind: "menu" })}
        />
      )}

      {screen.kind === "workspace" && (
        <Workspace
          connection={screen.connection}
          onExit={() => setScreen({ kind: "menu" })}
        />
      )}
    </box>
  )
}
