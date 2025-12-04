'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Excalidraw, 
  MainMenu, 
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"; 
import { supabase } from '@/lib/supabase';
import { debounce } from "lodash";
import { RealtimeChannel } from '@supabase/supabase-js';

const getRandomColor = () => {
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#ff9800', '#795548'];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function Whiteboard({ boardId }: { boardId: string }) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [initialData, setInitialData] = useState<any>(null);
  const initialLoadDone = useRef(false);
  
  // User & Collab State
  const [userName, setUserName] = useState<string>("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [myColor] = useState(getRandomColor()); 
  const [isLoading, setIsLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [showCopied, setShowCopied] = useState(false);
  
  // Refs for Collab Logic
  const channelRef = useRef<RealtimeChannel | null>(null); // <--- STORES ACTIVE CONNECTION
  const isReceivingUpdate = useRef(false); 

  // 1. LOAD DATA (Auto-create board if doesn't exist)
  useEffect(() => {
    const loadBoard = async () => {
      // Try to get existing board
      let { data, error } = await supabase
        .from('whiteboards')
        .select('elements, app_state')
        .eq('id', boardId)
        .single();

      // If board doesn't exist, create it
      if (error && error.code === 'PGRST116') {
        const { data: newBoard } = await supabase
          .from('whiteboards')
          .insert({
            id: boardId,
            elements: [],
            app_state: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_activity: new Date().toISOString()
          })
          .select()
          .single();
        
        data = newBoard;
      }

      if (data && data.elements) {
        setInitialData({
          elements: data.elements,
          appState: {
            ...(data.app_state || {}),
            collaborators: new Map()
          }
        });
      } else {
        setInitialData({
          elements: [],
          appState: {
            collaborators: new Map()
          }
        });
      }
      setTimeout(() => { initialLoadDone.current = true; }, 500);
    };
    loadBoard();
  }, [boardId]);

  // 2. REALTIME CONNECTION (The Fix)
  useEffect(() => {
    if (!isNameSet || !userName) return;

    // A. Create Channel
    const channel = supabase.channel(`room:${boardId}`, {
      config: { presence: { key: userName } },
    });

    // Save ref so we can use it in handleChange
    channelRef.current = channel;

    channel
      // B. Listen for Drawings
      .on('broadcast', { event: 'drawing-update' }, (payload) => {
        if (excalidrawAPI) {
            // Flag to prevent echo
            isReceivingUpdate.current = true;
            
            // Apply changes with files support
            const updateData: any = {
                elements: payload.payload.elements,
                appState: {
                  collaborators: new Map()
                }
            };
            
            // Add files if present (for images)
            if (payload.payload.files) {
              excalidrawAPI.addFiles(Object.values(payload.payload.files));
            }
            
            excalidrawAPI.updateScene(updateData);
            
            // Reset flag
            setTimeout(() => { isReceivingUpdate.current = false; }, 50);
        }
      })
      // C. Listen for Presence (Avatars)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setActiveUsers(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', newPresences);
        const state = channel.presenceState();
        setActiveUsers(state);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', leftPresences);
        const state = channel.presenceState();
        setActiveUsers(state);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
           console.log("Connected to Realtime!"); 
           
           // Update board activity timestamp when user joins
           await supabase.from('whiteboards').update({
             last_activity: new Date().toISOString()
           }).eq('id', boardId);
           
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
      channelRef.current = null;
      
      // Update last activity when user disconnects
      supabase.from('whiteboards').update({
        last_activity: new Date().toISOString()
      }).eq('id', boardId);
    };
  }, [boardId, isNameSet, userName, excalidrawAPI, myColor]);


  // 3. BROADCAST & SAVE
  const handleChange = (elements: readonly any[], appState: any) => {
    // Stop if we are receiving data OR if initial load isn't done
    if (isReceivingUpdate.current || !initialLoadDone.current) return;

    // A. Broadcast using the ACTIVE channel ref (Fixes connection issue)
    if (channelRef.current && excalidrawAPI) {
        const sceneData = excalidrawAPI.getSceneElements();
        const files = excalidrawAPI.getFiles();
        
        channelRef.current.send({
            type: 'broadcast',
            event: 'drawing-update',
            payload: { 
              elements: sceneData,
              files: files 
            },
        });
    }

    // B. Save to DB
    saveToDb(elements, appState);

    // C. Update Presence
    updateMyPresence(appState);
  };

  const saveToDb = useCallback(
    debounce(async (elements, appState) => {
      if (!initialLoadDone.current) return;
      
      // Clean appState to remove non-serializable data like collaborators Map
      const cleanAppState = {
        ...appState,
        collaborators: undefined // Remove Map object
      };
      
      await supabase.from('whiteboards').update({
          elements,
          app_state: cleanAppState,
          updated_at: new Date().toISOString(),
          last_activity: new Date().toISOString()
        }).eq('id', boardId);
    }, 500),
    [boardId]
  );

  const updateMyPresence = useCallback(
    debounce(async (appState) => {
        if (channelRef.current) {
            await channelRef.current.track({
                user: userName,
                color: myColor,
                view: { 
                    scrollX: appState.scrollX, 
                    scrollY: appState.scrollY, 
                    zoom: appState.zoom.value 
                }
            });
        }
    }, 500), 
    [userName, myColor]
  );

  // 4. ACTIONS
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

  const handleShare = () => {
    const url = `${window.location.origin}/board/${boardId}`;
    navigator.clipboard.writeText(url);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

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

  // LOGIN UI
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

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
       
       {/* UI: AVATARS + SHARE */}
       <div className="absolute top-4 right-4 z-20 flex flex-row items-center gap-4 pointer-events-auto">
          
          {/* AVATARS LIST */}
          <div className="flex -space-x-2 overflow-hidden">
             {/* My Avatar */}
             <div 
                className="h-10 w-10 rounded-full ring-2 ring-white flex items-center justify-center text-white font-bold shadow-sm"
                style={{ backgroundColor: myColor, lineHeight: '1' }}
                title={`${userName} (You)`}
             >
                <span className="text-sm">{userName.charAt(0).toUpperCase()}</span>
             </div>

             {/* Other Users */}
             {Object.keys(activeUsers).map((key: string) => {
                 const user = activeUsers[key][0]; 
                 if (user.user === userName) return null; 
                 
                 return (
                   <div 
                     key={key}
                     onClick={() => followUser(user)}
                     className="h-10 w-10 rounded-full ring-2 ring-white flex items-center justify-center text-white font-bold shadow-sm cursor-pointer hover:z-10 transition-transform hover:scale-110"
                     style={{ backgroundColor: user.color || '#ccc', lineHeight: '1' }}
                     title={`Click to jump to ${user.user}`}
                   >
                     <span className="text-sm">{user.user.charAt(0).toUpperCase()}</span>
                   </div>
                 );
             })}
          </div>

          {/* SHARE BUTTON */}
          <button 
            onClick={handleShare}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded shadow-lg flex items-center gap-2 relative"
          >
            <span>{showCopied ? 'Link Copied!' : 'Share'}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              {showCopied ? (
                <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
              ) : (
                <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
              )}
            </svg>
          </button>
       </div>

       {/* BOARD */}
       <Excalidraw
         initialData={initialData}
         excalidrawAPI={(api) => setExcalidrawAPI(api)}
         onChange={(elements, appState) => handleChange(elements, appState)}
       >
         <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage /> 
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
         </MainMenu>
       </Excalidraw>
    </div>
  );
}