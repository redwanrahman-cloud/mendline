import {useEffect,useRef} from 'react';

export default function ConfirmationDialog({message,accept,settle,title='Confirm desk change',cancelLabel='Cancel — keep current desk'}:{message:string;accept:string;settle:(accepted:boolean)=>void;title?:string;cancelLabel?:string}){
  const dialog=useRef<HTMLDialogElement>(null);
  const cancel=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const previous=document.activeElement;
    const node=dialog.current!;
    node.showModal();cancel.current?.focus();
    return ()=>{node.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[]);
  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onCancel={e=>{e.preventDefault();settle(false);}}>
    <h2 id="confirmation-title">{title}</h2>
    <p id="confirmation-message">{message}</p>
    <div className="toolbar"><button ref={cancel} autoFocus onClick={()=>settle(false)}>{cancelLabel}</button><button className="primary" onClick={()=>settle(true)}>{accept}</button></div>
  </dialog>;
}
