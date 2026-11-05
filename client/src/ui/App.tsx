import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { World } from "../game/World";

const API = import.meta.env.VITE_API_URL || "";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (API || window.location.origin);
type User={id:string;username:string};
export default function App(){
 const [user,setUser]=useState<User|null>(null),[token,setToken]=useState(localStorage.getItem("ms-token")||"");
 const [mode,setMode]=useState<"login"|"register">("login"),[username,setUsername]=useState(""),[password,setPassword]=useState("");
 const [message,setMessage]=useState("Crie sua conta ou entre para jogar."),[code,setCode]=useState(""),[room,setRoom]=useState<any>(null),[role,setRole]=useState(""),[phase,setPhase]=useState("LOBBY"),[friends,setFriends]=useState<any[]>([]),[friendName,setFriendName]=useState("");
 const socket=useRef<Socket|null>(null),gameHost=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!token)return; fetch(`${API}/api/me`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():null).then(u=>{if(u)setUser(u);else{localStorage.removeItem("ms-token");setToken("");}}).catch(()=>setMessage("Não foi possível conectar ao servidor."));},[token]);
 useEffect(()=>{if(!token||!user)return; const s=io(SOCKET_URL,{auth:{token}});socket.current=s;
 s.on("connect_error",()=>setMessage("Falha ao conectar. Confira o servidor."));
 s.on("room:update",r=>{setRoom(r);setPhase(r.phase);setCode(r.code);});
 s.on("game:started",r=>{setPhase("PLAYING");setRoom((old:any)=>({...old,players:r.players,map:r.map}));});
 s.on("game:role",r=>setRole(r.role));
 s.on("meeting:started",()=>setPhase("MEETING"));
 s.on("meeting:result",r=>{setRoom((old:any)=>({...old,players:r.players}));setPhase("PLAYING");setMessage(r.ejected?`${r.ejected} foi expulso.`:"Ninguém foi expulso.");});
 s.on("game:sabotage",r=>setMessage(`SABOTAGEM: ${r.type}`));
 return()=>{s.disconnect();socket.current=null;};},[token,user]);
 useEffect(()=>{if(!gameHost.current||phase!=="PLAYING")return; const game=new Phaser.Game({type:Phaser.AUTO,parent:gameHost.current,width:380,height:540,backgroundColor:"#101b2b",scene:[World],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});return()=>game.destroy(true);},[phase]);
 async function account(){try{const r=await fetch(`${API}/api/${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const d=await r.json();if(!r.ok)throw Error(d.error);localStorage.setItem("ms-token",d.token);setToken(d.token);setUser(d.user);setMessage("Bem-vindo ao MINI SUS!");}catch(e:any){setMessage(e.message||"Erro de conexão.");}}
 function createRoom(){socket.current?.emit("room:create",{map:"Nave"},(r:any)=>{if(r?.error)setMessage(r.error);else setCode(r.code);});}
 function joinRoom(){socket.current?.emit("room:join",{code},(r:any)=>setMessage(r?.error||"Entrou na sala!"));}
 function start(){socket.current?.emit("game:start",{code},(r:any)=>r?.error&&setMessage(r.error));}
 async function loadFriends(){const r=await fetch(`${API}/api/friends`,{headers:{Authorization:`Bearer ${token}`}});if(r.ok)setFriends(await r.json());}
 async function addFriend(){const r=await fetch(`${API}/api/friends`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({username:friendName})});const d=await r.json();setMessage(r.ok?"Solicitação enviada.":d.error);loadFriends();}
 if(!user)return <main className="auth"><div className="logo">MINI<span>SUS</span></div><p className="muted">Encontre o impostor. Salve a nave.</p><section className="panel"><h1>{mode==="login"?"Entrar":"Criar conta"}</h1><input placeholder="Nome de jogador" value={username} onChange={e=>setUsername(e.target.value)} maxLength={18}/><input placeholder="Senha (mínimo 6 caracteres)" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button onClick={account}>{mode==="login"?"ENTRAR":"CADASTRAR"}</button><p className="switch" onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login"?"Não tem conta? Cadastre-se":"Já tem conta? Entrar"}</p><small>{message}</small></section></main>;
 return <main className="app"><header><div className="logo">MINI<span>SUS</span></div><div className="user">● {user.username}</div></header><p className="muted">Sua tripulação está esperando.</p><section className="panel"><h2>Multiplayer</h2><div className="actions"><button onClick={createRoom}>CRIAR SALA</button><button className="secondary" onClick={start} disabled={!room||phase!=="LOBBY"}>INICIAR</button></div><div className="join"><input placeholder="Código da sala" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button className="secondary" onClick={joinRoom}>ENTRAR</button></div>{room&&<><h3>Sala {room.code} · {room.players?.length||1}/15</h3><div className="players">{room.players?.map((p:any)=><span key={p.id}>👨‍🚀 {p.username}</span>)}</div><small>São necessários pelo menos 4 jogadores para iniciar.</small></>}</section>
 {phase==="PLAYING"&&<section className="panel"><h2>Partida · {role||"Tripulante"}</h2><div ref={gameHost} className="game"></div><div className="actions"><button onClick={()=>socket.current?.emit("task:complete",{code},(r:any)=>setMessage(r?.error||`Tarefa concluída! Total: ${r.tasks}`))}>FAZER TAREFA</button><button className="secondary" onClick={()=>socket.current?.emit("meeting:call",{code},(r:any)=>r?.error&&setMessage(r.error))}>REUNIÃO</button></div>{role==="IMPOSTOR"&&<button className="danger" onClick={()=>socket.current?.emit("sabotage",{code,type:"Luzes"})}>SABOTAR LUZES</button>}</section>}
 {phase==="MEETING"&&<section className="panel"><h2>Reunião de emergência</h2>{room?.players?.filter((p:any)=>p.alive).map((p:any)=><button className="vote" key={p.id} onClick={()=>socket.current?.emit("vote",{code,targetId:p.id},(r:any)=>r?.error&&setMessage(r.error))}>Votar em {p.username}</button>)}</section>}
 <section className="panel"><h2>Amigos</h2><div className="join"><input placeholder="Nome do jogador" value={friendName} onChange={e=>setFriendName(e.target.value)}/><button className="secondary" onClick={addFriend}>ADICIONAR</button></div><button className="link" onClick={loadFriends}>Atualizar amigos</button>{friends.map(f=><p key={f.id}>{f.user.username} · {f.status}</p>)}</section><p className="notice">{message}</p><button className="link" onClick={()=>{localStorage.removeItem("ms-token");setToken("");setUser(null);}}>Sair da conta</button></main>;
}
