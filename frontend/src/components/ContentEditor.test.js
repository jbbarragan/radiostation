import React from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import ContentEditor, { DRAG_TYPE, readDrag } from './ContentEditor';
import api from '../api/client';

jest.mock('../api/client',()=>({__esModule:true,default:{post:jest.fn()},getTracks:jest.fn(),getFolders:jest.fn(),getPlaylists:jest.fn()}));
jest.mock('@tanstack/react-query',()=>({useQuery:({queryKey})=>({data:{data:queryKey[0]==='tracks'?[{id:'track-a',title:'Pista A',duration:30},{id:'track-b',title:'Pista B',duration:40}]:[]}})}));
let root, host, changed;
const value={id:'playlist-1',playlist_tracks:[{id:1,track:{id:'track-a',title:'Pista A',duration:30}},{id:2,track:{id:'track-b',title:'Pista B',duration:40}}]};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);changed=jest.fn();api.post.mockReset();api.post.mockResolvedValue({data:value});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=()=>act(()=>root.render(<ContentEditor kind="playlists" value={value} onChanged={changed}/>));
const drop=async(data,pos)=>{
 await act(async()=>{Simulate.drop(host.querySelectorAll('.radio-drop')[pos],{dataTransfer:{getData:type=>type===DRAG_TYPE?JSON.stringify(data):''},preventDefault:()=>{},stopPropagation:()=>{}});});
};
it('inserts external tracks between existing playlist entries',async()=>{
 render();await drop({kind:'tracks',ids:['track-a','track-b']},1);
 expect(api.post).toHaveBeenCalledWith('/playlists/playlist-1/add_track/',{track_ids:['track-a','track-b'],position:1});expect(changed).toHaveBeenCalled();
});
it('reorders entry IDs, preserving duplicates of the same audio',async()=>{
 render();await drop({kind:'item',owner:'playlists/playlist-1',id:2},0);
 expect(api.post).toHaveBeenCalledWith('/playlists/playlist-1/reorder/',{order:[2,1]});
});
it('inserts a playlist at a precise location',async()=>{
 render();await drop({kind:'playlist',id:'other'},0);
 expect(api.post).toHaveBeenCalledWith('/playlists/playlist-1/add_track/',{playlist_id:'other',position:0});
});
it('ignores foreign row IDs and malformed drag data',async()=>{
 render();await drop({kind:'item',owner:'shows/other',id:2},0);
 expect(api.post).not.toHaveBeenCalled();expect(readDrag({dataTransfer:{getData:()=>'{broken'}})).toBeNull();
});
it('reports a failed save and retains the visible order',async()=>{
 api.post.mockRejectedValueOnce(new Error('offline'));render();await drop({kind:'tracks',ids:['track-a']},0);
 expect(host.querySelector('[role=alert]').textContent).toContain('No se guardó');expect(changed).not.toHaveBeenCalled();
 expect(host.querySelectorAll('.radio-running-order .radio-content-row')).toHaveLength(2);
});
