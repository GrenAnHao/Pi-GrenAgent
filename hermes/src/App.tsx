import { useState } from 'react';
import { ChatView } from './features/chat/ChatView';
import { SessionList } from './features/sessions/SessionList';
import { useSessionStore } from './store';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const setSessions = useSessionStore((state) => state.setSessions);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);

  const handleCreateSession = async () => {
    const newSession = {
      path: `/session-${Date.now()}`,
      name: 'New Session',
      lastModified: Date.now(),
    };
    const sessions = useSessionStore.getState().sessions;
    setSessions([...sessions, newSession]);
    setActiveSession(newSession.path);
  };

  const handleSwitchSession = async (path: string) => {
    setActiveSession(path);
  };

  const handleDeleteSession = async (path: string) => {
    const sessions = useSessionStore.getState().sessions;
    setSessions(sessions.filter((s) => s.path !== path));
  };

  return (
    <div className="h-screen flex">
      {sidebarOpen && (
        <div className="w-64 border-r">
          <SessionList
            onCreateSession={handleCreateSession}
            onSwitchSession={handleSwitchSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <header className="h-12 bg-gray-800 text-white flex items-center px-4 justify-between">
          <h1 className="text-lg font-bold">Hermes</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </header>
        <main className="flex-1 overflow-hidden">
          <ChatView />
        </main>
      </div>
    </div>
  );
}
