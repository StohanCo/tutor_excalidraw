'use client'
import { useState, useEffect, useCallback } from 'react'
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { supabase } from '@/app/components/lib/supabase';
import { debounce } from "lodash"; // You might need to `npm install lodash @types/lodash`
import "@excalidraw/excalidraw/index.css";

export default function Whiteboard({ boardId }: { boardId: string }) {
  const [initialData, setInitialData] = useState<any>(null);

  // 1. Load data from Supabase on mount
  useEffect(() => {
    const loadBoard = async () => {
      const { data, error } = await supabase
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

  // 2. Save to Supabase (Debounced to prevent saving every millisecond)
  const saveData = useCallback(
    debounce(async (elements, appState) => {
      // Save current state
      await supabase
        .from('whiteboards')
        .update({
          elements,
          app_state: appState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', boardId);

      // Save a "version" for undo/redo history
      // (You might want to trigger this less frequently than the main save)
      await supabase
        .from('whiteboard_versions')
        .insert({
          whiteboard_id: boardId,
          elements,
          app_state: appState
        });
    }, 1000), // Waits 1 second after you stop drawing to save
    [boardId]
  );

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
       <Excalidraw
         initialData={initialData}
         onChange={(elements, appState) => saveData(elements, appState)}
       />
    </div>
  );
}