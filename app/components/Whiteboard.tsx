'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Excalidraw, 
  MainMenu, 
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"; 
import { supabase } from '@/lib/supabase';
import { debounce } from "lodash";

export default function Whiteboard({ boardId }: { boardId: string }) {
  const [initialData, setInitialData] = useState<any>(null);
  const [userName, setUserName] = useState<string>("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Added loading state for the join process
  const participantIdRef = useRef<string | null>(null);

  // 1. LOAD DATA
  useEffect(() => {
    const loadBoard = async () => {
      const { data } = await supabase
        .from('whiteboards')
        .select('elements, app_state')
        .eq('id', boardId)
        .single();

      if (data) {
        setInitialData({
          elements: data.elements,
          appState: data.app_state
        });
      }
    };
    loadBoard();
  }, [boardId]);

  // 2. SAVE DATA
  const saveData = useCallback(
    debounce(async (elements, appState) => {
      await supabase.from('whiteboards').update({
          elements,
          app_state: appState,
          updated_at: new Date().toISOString(),
        }).eq('id', boardId);
      
      await supabase.from('whiteboard_versions').insert({
          whiteboard_id: boardId,
          elements,
          app_state: appState
        });
    }, 1000),
    [boardId]
  );

  // ------------------------------------------------------------
  // 3. NEW: GET USER INFO & JOIN
  // ------------------------------------------------------------
  const handleJoin = async () => {
    if (!userName) return;
    setIsLoading(true); // Show loading while we fetch IP

    // A. Gather Browser/System Info
    const userAgent = window.navigator.userAgent || "no info";
    const screenRes = `${window.screen.width}x${window.screen.height}` || "no info";
    
    // B. Gather IP Address (Fetch from external service)
    let ipAddress = "no info";
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      if (data.ip) ipAddress = data.ip;
    } catch (error) {
      console.error("Could not fetch IP:", error);
      // We keep 'no info' if this fails (e.g. adblocker blocked it)
    }

    setIsNameSet(true);

    // C. Insert into Supabase with new fields
    const { data, error } = await supabase
      .from('participants')
      .insert({
        whiteboard_id: boardId,
        user_name: userName,
        ip_address: ipAddress,
        system_info: userAgent,
        screen_res: screenRes,
        joined_at: new Date().toISOString()
      })
      .select()
      .single();

    if (data) {
      participantIdRef.current = data.id;
    }
    setIsLoading(false);
  };

  // 4. HANDLE LEAVING
  useEffect(() => {
    const handleTabClose = () => {
      if (participantIdRef.current) {
        supabase
          .from('participants')
          .update({ left_at: new Date().toISOString() })
          .eq('id', participantIdRef.current)
          .then(); 
      }
    };
    window.addEventListener('beforeunload', handleTabClose);
    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
      handleTabClose();
    };
  }, []);

  // 5. HANDLE SHARING
  const handleShare = () => {
    const url = `${window.location.origin}/board/${boardId}`;
    navigator.clipboard.writeText(url);
    alert(`Link copied: ${url}`);
  };

  // RENDER
  if (!isNameSet) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96">
          <h2 className="text-2xl font-bold mb-4">Join Whiteboard</h2>
          <input
            type="text"
            placeholder="What is your name?"
            className="w-full border p-2 rounded mb-4 text-black"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            disabled={isLoading}
          />
          <button 
            onClick={handleJoin}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isLoading ? "Entering..." : "Enter Room"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
       <Excalidraw
         initialData={initialData}
         onChange={(elements, appState) => saveData(elements, appState)}
         renderTopRightUI={() => (
            <button 
              style={{
                backgroundColor: "#40c057",
                color: "white",
                border: "none",
                padding: "8px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                height: "36px", 
                marginLeft: "10px"
              }}
              onClick={handleShare}
            >
              Share
            </button>
         )}
       >
         <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage /> 
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.Item onSelect={handleShare}>
              Share Whiteboard
            </MainMenu.Item>
            <MainMenu.DefaultItems.ChangeCanvasBackground />
         </MainMenu>
       </Excalidraw>
    </div>
  );
}