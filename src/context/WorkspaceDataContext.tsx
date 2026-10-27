"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CustomFilter } from "@/lib/tasks/customFilters";
import type { Client, ClientStatus } from "@/components/NewClientModal";
import type { Matter, MatterStatus } from "@/components/NewMatterModal";
import type { BoardTask } from "@/components/NewTaskModal";

type WorkspaceDataContextValue = {
  clients: Client[];
  clientsLoaded: boolean;
  addClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  deleteClients: (ids: string[]) => void;
  bulkSetClientStatus: (ids: string[], status: ClientStatus) => void;

  matters: Matter[];
  mattersLoaded: boolean;
  addMatter: (matter: Matter) => void;
  updateMatter: (matter: Matter) => void;
  deleteMatters: (ids: string[]) => void;
  bulkSetMatterStatus: (ids: string[], status: MatterStatus) => void;

  tasks: BoardTask[];
  tasksLoaded: boolean;
  tasksError: string | null;
  clearTasksError: () => void;
  addTask: (task: BoardTask) => void;
  updateTask: (task: BoardTask) => void;
  deleteTasks: (ids: string[]) => void;
  refreshAll: () => void;

  // People in this workspace (for assignees) and the signed-in user.
  teamMembers: { id: string; email: string; fullName?: string | null; role: string }[];
  meEmail: string | null;
  // The signed-in person's role ("owner" | "admin" | "member"), null until the team has loaded.
  myRole: string | null;
  // Accept a task offered to several people (the first to accept takes it).
  acceptTask: (id: string) => Promise<void>;

  // Sub boards under the Task Board.
  boards: { id: string; name: string }[];
  // The firm's name for the built-in board of tasks not on a sub board ("General").
  generalName: string;
  // Each board's own quick filters ("+ Add more"), keyed by board id / "general" / "all".
  boardFilters: Record<string, CustomFilter[]>;
  saveBoardFilters: (board: string, filters: CustomFilter[]) => Promise<void>;
  renameGeneral: (name: string) => Promise<void>;
  moveGeneralTasks: (toBoardId: string) => Promise<number>;
  boardsError: string | null;
  createBoard: (name: string) => Promise<{ id: string; name: string }>;
  renameBoard: (id: string, name: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
};

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | null>(null);

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [mattersLoaded, setMattersLoaded] = useState(false);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; email: string; fullName?: string | null; role: string }[]>([]);
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [generalName, setGeneralName] = useState("General");
  const [boardFilters, setBoardFilters] = useState<Record<string, CustomFilter[]>>({});
  const [boardsError, setBoardsError] = useState<string | null>(null);

  // Re-fetch shared data (e.g. after the AI Agent creates a client or task).
  const refreshAll = useCallback(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => d.clients && setClients(d.clients)).catch(() => {});
    fetch("/api/matters").then((r) => r.json()).then((d) => d.matters && setMatters(d.matters)).catch(() => {});
    fetch("/api/tasks").then(readJson).then((d) => d.tasks && setTasks(d.tasks)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => setClients(data.clients ?? []))
      .catch((err) => console.error("Failed to load clients:", err))
      .finally(() => setClientsLoaded(true));

    fetch("/api/matters")
      .then((res) => res.json())
      .then((data) => setMatters(data.matters ?? []))
      .catch((err) => console.error("Failed to load matters:", err))
      .finally(() => setMattersLoaded(true));

    fetch("/api/boards")
      .then(readJson)
      .then((d) => {
        setBoards(d.boards ?? []);
        if (typeof d.generalName === "string" && d.generalName.trim()) setGeneralName(d.generalName);
        if (d.boardFilters && typeof d.boardFilters === "object") setBoardFilters(d.boardFilters);
      })
      .catch((e: Error) => setBoardsError(e.message));

    fetch("/api/team")
      .then(readJson)
      .then((d) => {
        setTeamMembers(d.members ?? []);
        setMeEmail(d.me?.email ?? null);
      })
      .catch(() => {}); // non-fatal: assignee menus just stay empty

    fetch("/api/tasks")
      .then(readJson)
      .then((data) => setTasks(data.tasks ?? []))
      .catch((err) => {
        console.error("Failed to load tasks:", err);
        setTasksError("Couldn't load tasks from the database.");
      })
      .finally(() => setTasksLoaded(true));
  }, []);

  const clearTasksError = useCallback(() => setTasksError(null), []);

  const createBoard = useCallback(async (name: string) => {
    const d = await readJson(
      await fetch("/api/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    );
    setBoards((bs) => [...bs, d.board]);
    setBoardsError(null);
    return d.board as { id: string; name: string };
  }, []);

  const renameBoard = useCallback(async (id: string, name: string) => {
    const d = await readJson(
      await fetch(`/api/boards/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    );
    setBoards((bs) => bs.map((b) => (b.id === id ? d.board : b)));
  }, []);

  const saveBoardFilters = useCallback(async (board: string, filters: CustomFilter[]) => {
    const prev = boardFilters;
    setBoardFilters((all) => ({ ...all, [board]: filters })); // show it right away
    try {
      const d = await readJson(
        await fetch(`/api/boards/filters`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ board, filters }) })
      );
      if (d.boardFilters) setBoardFilters(d.boardFilters);
    } catch (e) {
      setBoardFilters(prev);
      throw e;
    }
  }, [boardFilters]);

  const acceptTask = useCallback(async (id: string) => {
    const r = await fetch(`/api/tasks/${id}/accept`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Someone else was quicker: refresh so the task leaves this list.
      fetch("/api/tasks").then((x) => x.json()).then((x) => Array.isArray(x.tasks) && setTasks(x.tasks)).catch(() => {});
      throw new Error(d?.error ?? "The task couldn't be accepted.");
    }
    setTasks((ts) => ts.map((t) => (t.id === id ? (d.task as BoardTask) : t)));
  }, []);

  const renameGeneral = useCallback(async (name: string) => {
    const d = await readJson(
      await fetch(`/api/boards/general`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    );
    setGeneralName(d.board?.name ?? name);
  }, []);

  // Moves every task on General to another board.
  const moveGeneralTasks = useCallback(async (toBoardId: string) => {
    const d = await readJson(
      await fetch(`/api/boards/general`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", toBoardId }) })
    );
    setTasks((ts) => ts.map((t) => (t.boardId ? t : { ...t, boardId: toBoardId, columnId: null })));
    return (d.moved as number) ?? 0;
  }, []);

  // Its tasks move back to the main Task Board (same as the database does).
  const deleteBoard = useCallback(async (id: string) => {
    await readJson(await fetch(`/api/boards/${id}`, { method: "DELETE" }));
    setBoards((bs) => bs.filter((b) => b.id !== id));
    setTasks((ts) => ts.map((t) => (t.boardId === id ? { ...t, boardId: null } : t)));
  }, []);

  const addTask = useCallback((task: BoardTask) => {
    const optimistic = { ...task, createdAt: task.createdAt ?? new Date().toISOString() };
    setTasks((ts) => [...ts, optimistic]);
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    })
      .then(readJson)
      .then((data) => {
        if (data.task) setTasks((ts) => ts.map((t) => (t.id === task.id ? data.task : t)));
      })
      .catch((err) => {
        console.error("Failed to save task:", err);
        setTasks((ts) => ts.filter((t) => t.id !== task.id)); // roll back
        setTasksError(/database update/.test(String(err?.message)) ? String(err.message) : `"${task.title}" wasn't saved. Please try again.`);
      });
  }, []);

  const updateTask = useCallback(
    (incoming: BoardTask) => {
      const previous = tasks.find((t) => t.id === incoming.id);
      // Changing a task's status (e.g. ticking it done) moves it out of a
      // custom column into the matching standard one.
      const task =
        previous && previous.status !== incoming.status && incoming.columnId && incoming.columnId === previous.columnId
          ? { ...incoming, columnId: null }
          : incoming;
      setTasks((ts) => ts.map((t) => (t.id === task.id ? task : t))); // optimistic
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      })
        .then(readJson)
        .then((data) => {
          if (data.task) setTasks((ts) => ts.map((t) => (t.id === task.id ? data.task : t)));
        })
        .catch((err) => {
          console.error("Failed to update task:", err);
          if (previous) setTasks((ts) => ts.map((t) => (t.id === task.id ? previous : t)));
          setTasksError(/database update/.test(String(err?.message)) ? String(err.message) : "Your change to a task wasn't saved. Please try again.");
        });
    },
    [tasks]
  );

  const deleteTasks = useCallback(
    (ids: string[]) => {
      const removed = tasks.filter((t) => ids.includes(t.id));
      setTasks((ts) => ts.filter((t) => !ids.includes(t.id))); // optimistic
      fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
        .then(readJson)
        .catch((err) => {
          console.error("Failed to delete tasks:", err);
          setTasks((ts) => [...ts, ...removed]);
          setTasksError("Couldn't delete the task. Please try again.");
        });
    },
    [tasks]
  );

  const addClient = useCallback((client: Client) => {
    setClients((cs) => [...cs, client]); // optimistic
    fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.client) {
          setClients((cs) => cs.map((c) => (c.id === client.id ? data.client : c)));
        }
      })
      .catch((err) => console.error("Failed to save client:", err));
  }, []);

  const updateClient = useCallback((client: Client) => {
    setClients((cs) => cs.map((c) => (c.id === client.id ? client : c))); // optimistic
    fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.client) {
          setClients((cs) => cs.map((c) => (c.id === client.id ? data.client : c)));
        }
      })
      .catch((err) => console.error("Failed to update client:", err));
  }, []);

  const deleteClients = useCallback((ids: string[]) => {
    setClients((cs) => cs.filter((c) => !ids.includes(c.id))); // optimistic
    fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch((err) => console.error("Failed to delete clients:", err));
  }, []);

  const bulkSetClientStatus = useCallback(
    (ids: string[], status: ClientStatus) => {
      const updatedAt = new Date().toISOString();
      setClients((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, status, updatedAt } : c)));
      ids.forEach((id) => {
        const client = clients.find((c) => c.id === id);
        if (!client) return;
        fetch(`/api/clients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...client, status, updatedAt }),
        }).catch((err) => console.error("Failed to update client status:", err));
      });
    },
    [clients]
  );

  const addMatter = useCallback((matter: Matter) => {
    setMatters((ms) => [...ms, matter]); // optimistic
    fetch("/api/matters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matter),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (ok && data.matter) {
          setMatters((ms) => ms.map((m) => (m.id === matter.id ? data.matter : m)));
        } else if (!ok) {
          setMatters((ms) => ms.filter((m) => m.id !== matter.id));
          alert(`The matter wasn't created: ${data?.error ?? "please try again."}`);
        }
      })
      .catch((err) => console.error("Failed to save matter:", err));
  }, []);

  const updateMatter = useCallback((matter: Matter) => {
    let previous: Matter | undefined;
    setMatters((ms) => {
      previous = ms.find((m) => m.id === matter.id);
      return ms.map((m) => (m.id === matter.id ? matter : m)); // optimistic
    });
    fetch(`/api/matters/${matter.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matter),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (ok && data.matter) {
          setMatters((ms) => ms.map((m) => (m.id === matter.id ? data.matter : m)));
        } else if (!ok) {
          if (previous) setMatters((ms) => ms.map((m) => (m.id === matter.id ? previous! : m)));
          alert(`The matter wasn't saved: ${data?.error ?? "please try again."}`);
        }
      })
      .catch((err) => console.error("Failed to update matter:", err));
  }, []);

  const deleteMatters = useCallback((ids: string[]) => {
    setMatters((ms) => ms.filter((m) => !ids.includes(m.id))); // optimistic
    fetch("/api/matters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch((err) => console.error("Failed to delete matters:", err));
  }, []);

  const bulkSetMatterStatus = useCallback(
    (ids: string[], status: MatterStatus) => {
      const updatedAt = new Date().toISOString();
      setMatters((ms) => ms.map((m) => (ids.includes(m.id) ? { ...m, status, updatedAt } : m)));
      ids.forEach((id) => {
        const matter = matters.find((m) => m.id === id);
        if (!matter) return;
        fetch(`/api/matters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...matter, status, updatedAt }),
        }).catch((err) => console.error("Failed to update matter status:", err));
      });
    },
    [matters]
  );

  return (
    <WorkspaceDataContext.Provider
      value={{
        clients,
        clientsLoaded,
        addClient,
        updateClient,
        deleteClients,
        bulkSetClientStatus,
        matters,
        mattersLoaded,
        addMatter,
        updateMatter,
        deleteMatters,
        bulkSetMatterStatus,
        tasks,
        tasksLoaded,
        tasksError,
        clearTasksError,
        addTask,
        updateTask,
        deleteTasks,
        refreshAll,
        teamMembers,
        meEmail,
        acceptTask,
        myRole: meEmail ? teamMembers.find((m) => m.email.toLowerCase() === meEmail.toLowerCase())?.role ?? (teamMembers.length ? "member" : null) : null,
        boards,
        generalName,
        boardFilters,
        saveBoardFilters,
        renameGeneral,
        moveGeneralTasks,
        boardsError,
        createBoard,
        renameBoard,
        deleteBoard,
      }}
    >
      {children}
    </WorkspaceDataContext.Provider>
  );
}

export function useWorkspaceData() {
  const ctx = useContext(WorkspaceDataContext);
  if (!ctx) {
    throw new Error("useWorkspaceData must be used within WorkspaceDataProvider");
  }
  return ctx;
}
