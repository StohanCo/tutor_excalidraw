'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Excalidraw, 
  MainMenu, 
  convertToExcalidrawElements
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"; 
import { supabase } from '@/lib/supabase';
import { debounce } from "lodash";

// Random color generator for user avatars
const getRandomColor = () => {
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#ff9800', '#795548'];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function Whiteboard({ boardId }: { boardId: string }) {
  // Using 'any' to bypass version type mismatch issues
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [initialData, setInitialData] = useState<any>(null);
  
  // Sync Safety State
  const [isLoaded, setIsLoaded] = useState(false); // <--- PREVENTS WIPING DATA

  // User State
  const [userName, setUserName] = useState<string>("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [myColor] = useState(getRandomColor()); 
  const [isLoading, setIsLoading] = useState(false);
  
  // Collab State
  const [activeUsers, setActiveUsers] = useState<any>({});
  const participantIdRef = useRef<string | null>(null);
  const isReceivingUpdate = useRef(false); 

  // 1. LOAD INITIAL DATA FROM DB
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
      // Mark as loaded so we can start broadcasting changes
      setIsLoaded(true);
    };
    loadBoard();
  }, [boardId]);

  // 2. SETUP REALTIME SUBSCRIPTION
  useEffect(() => {
    if (!isNameSet || !userName) return;

    const channel = supabase.channel(`room:${boardId}`, {
      config: { presence: { key: userName } },
    });

    channel
      .on('broadcast', { event: 'drawing-update' }, (payload) => {
        if (excalidrawAPI) {
            isReceivingUpdate.current = true;
            excalidrawAPI.updateScene({
                elements: payload.payload.elements
            });
            // Short timeout to ensure we don't echo back
            setTimeout(() => { isReceivingUpdate.current = false; }, 50);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setActiveUsers(state);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
           await channel.track({
             user: userName,
             color: myColor,
             view: { x: 0, y: 0, zoom: 1 }, 
             online_at: new Date().toISOString(),
           });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, isNameSet, userName, excalidrawAPI, myColor]);


  // 3. BROADCAST CHANGES (Now Protected)
  const handleChange = (elements: readonly any[], appState: any) => {
    // SAFETY CHECK: If we haven't loaded DB yet, OR we are receiving an update, DO NOT broadcast.
    // This stops the "New User Wipes Board" bug.
    if (!isLoaded || isReceivingUpdate.current) return;

    // A. Broadcast to peers (Fast)
    supabase.channel(`room:${boardId}`).send({
        type: 'broadcast',
        event: 'drawing-update',
        payload: { elements },
    });

    // B. Save to DB (Slow/Debounced)
    saveToDb(elements, appState);

    // C. Update my Presence (Viewport)
    updateMyPresence(appState);
  };

  const saveToDb = useCallback(
    debounce(async (elements, appState) => {
      await supabase.from('whiteboards').update({
          elements,
          app_state: appState,
          updated_at: new Date().toISOString(),
        }).eq('id', boardId);
    }, 2000),
    [boardId]
  );

  const updateMyPresence = useCallback(
    debounce(async (appState) => {
        const channel = supabase.channel(`room:${boardId}`);
        await channel.track({
            user: userName,
            color: myColor,
            view: { 
                scrollX: appState.scrollX, 
                scrollY: appState.scrollY, 
                zoom: appState.zoom.value 
            }
        });
    }, 500), 
    [boardId, userName, myColor]
  );

  // 4. JOIN LOGIC
  const handleJoin = async () => {
    if (!userName) return;
    setIsLoading(true);

    const userAgent = window.navigator.userAgent || "no info";
    let ipAddress = "no info";
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      if(data.ip) ipAddress = data.ip;
    } catch(e) {}

    await supabase.from('participants').insert({
        whiteboard_id: boardId,
        user_name: userName,
        ip_address: ipAddress,
        system_info: userAgent,
        joined_at: new Date().toISOString()
    });

    setIsNameSet(true);
    setIsLoading(false);
  };

  // 5. SHARE LOGIC
  const handleShare = () => {
    const url = `${window.location.origin}/board/${boardId}`;
    navigator.clipboard.writeText(url);
    alert(`Link copied: ${url}`);
  };

  // 6. JUMP TO USER VIEW
  const followUser = (userData: any) => {
      if (!excalidrawAPI || !userData.view) return;
      excalidrawAPI.updateScene({
          appState: {
              scrollX: userData.view.scrollX,
              scrollY: userData.view.scrollY,
              zoom: { value: userData.view.zoom || 1 }
          }
      });
  };

  // RENDER: LOGIN SCREEN
  if (!isNameSet) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96">
          <h2 className="text-2xl font-bold mb-4">Join Collaboration</h2>
          <input
            type="text"
            placeholder="Enter your name"
            className="w-full border p-2 rounded mb-4 text-black"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button 
            onClick={handleJoin}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
          >
            {isLoading ? "Joining..." : "Start Drawing"}
          </button>
        </div>
      </div>
    );
  }

  // RENDER: WHITEBOARD
  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
       
       {/* AVATAR LIST UI - MOVED TO RIGHT SIDE */}
       <div className="absolute top-4 right-36 z-10 flex flex-row-reverse gap-2">
          {/* Render myself */}
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold border-2 border-white shadow-lg"
            style={{ backgroundColor: myColor }}
            title={`${userName} (You)`}
          >
            {userName.charAt(0).toUpperCase()}
          </div>

          {/* Render other users */}
          {Object.keys(activeUsers).map((key: string) => {
             const user = activeUsers[key][0]; 
             if (user.user === userName) return null; 

             return (
               <div 
                 key={key}
                 onClick={() => followUser(user)}
                 className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold border-2 border-white shadow-lg cursor-pointer hover:scale-110 transition-transform"
                 style={{ backgroundColor: user.color || '#ccc' }}
                 title={`Click to jump to ${user.user}'s screen`}
               >
                 {user.user.charAt(0).toUpperCase()}
               </div>
             );
          })}
       </div>

       <Excalidraw
         initialData={initialData}
         excalidrawAPI={(api) => setExcalidrawAPI(api)}
         onChange={(elements, appState) => handleChange(elements, appState)}
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
                marginLeft: "10px",
                fontWeight: "bold"
              }}
              onClick={handleShare}
            >
              Share
            </button>
         )}
       >
         <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.SaveAsImage /> 
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.Separator />
            <MainMenu.Item onSelect={handleShare}>
                Share Link
            </MainMenu.Item>
         </MainMenu>
       </Excalidraw>
    </div>
  );
}