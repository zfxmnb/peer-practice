import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { DataConnection, Peer } from 'peerjs';
import { v4 } from 'uuid';
import getNickName from './utils/getNickName';

// import styles from './app.css';

const parseStr = (str: string, def?: any) => {
  try {
    return JSON.parse(str) ?? def;
  } catch (err) {}
  return def;
};

const AUTO_ACCEPT = true;
const MY_INFO_CACHE_KEY = 'my_peer_id';
const FRIENDS_CACHE_SUFFIX = 'friends';
const CHATS_CACHE_SUFFIX = 'chats';
enum MSG_TYPE {
  REQ = 'connect_request',
  OK = 'connect_ok',
  REJ = 'connect_reject',
  MSG = 'message',
}
interface Chat {
  status: 0 | 1;
  id: string;
  nickName?: string;
  connection?: DataConnection;
  messages: Message[];
}

interface Data<T = any> {
  type?: MSG_TYPE;
  data?: T;
  sender?: Person;
}
const getFriendsCacheKey = (id: string) => `${id}_${FRIENDS_CACHE_SUFFIX}`;
const getChatsCacheKey = (id: string) => `${id}_${CHATS_CACHE_SUFFIX}`;

const InitInfo: Person = parseStr(localStorage.getItem(MY_INFO_CACHE_KEY) ?? '', undefined);
const InitFriends: Person[] = parseStr(
  localStorage.getItem(getFriendsCacheKey(InitInfo?.id)) ?? '',
  [],
);
const InitChats: Record<string, Chat> = parseStr(
  localStorage.getItem(getChatsCacheKey(InitInfo?.id)) ?? '',
  {},
);
let peer: Peer;

export function App() {
  const [loading, setLoading] = useState(false);

  const [myInfo, setMyInfo] = useState<Person>(InitInfo);
  const myInfoRef = useRef(myInfo);
  myInfoRef.current = myInfo;

  const [friends, setFriends] = useState(InitFriends);
  const friendsRef = useRef(friends);
  friendsRef.current = friends;

  const [chats, setChats] = useState(InitChats);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const [activeChat, setActiveChat] = useState<string>();

  const chat = activeChat ? chats[activeChat] : undefined;
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const inputRef = useRef<HTMLInputElement>();
  const messageRef = useRef<HTMLInputElement>();

  const videoRef = useRef<HTMLVideoElement>();
  const localVideoRef = useRef<HTMLVideoElement>();
  const removeVideoRef = useRef<HTMLVideoElement>();
  const streamRef = useRef<MediaStream>();

  const setMessage = useCallback((message: Message) => {
    const id = myInfoRef.current?.id === message.senderId ? message.receiveId : message.senderId;
    if (chatsRef.current[id]) {
      chatsRef.current[id].messages.push({ ...message });
      setChats({ ...chatsRef.current });
    }
  }, []);

  const senderOpen = (connection: DataConnection) => {
    const connectId = v4();
    connection.send({ type: MSG_TYPE.REQ, data: connectId, sender: myInfoRef.current });
    // 主动发送接收
    connection.on('data', (res) => {
      const { type, data, sender }: Data = res ?? {};
      if (!sender) return;
      console.log({ type, data, sender });
      if (type === MSG_TYPE.OK && data === connectId) {
        const friend = friends.find(({ id }) => id === sender?.id);
        if (!friend) {
          friends.unshift({ id: sender.id, nickName: sender.nickName });
        } else {
          friend.nickName = sender.nickName;
        }
        setFriends([...friends]);
        if (!chatsRef.current[sender.id]) {
          chatsRef.current[sender.id] = {
            connection,
            messages: [],
            id: sender.id,
            nickName: friend?.nickName,
            status: 1,
          };
        } else {
          chatsRef.current[sender.id].connection = connection;
          chatsRef.current[sender.id].nickName = sender.nickName;
          chatsRef.current[sender.id].status = 1;
        }
        setChats({ ...chatsRef.current });
        setActiveChat(sender.id);
        setLoading(false);
      }
      if (type === MSG_TYPE.REJ && data === connectId) {
        setLoading(false);
      }
      if (type === MSG_TYPE.MSG && sender && data) {
        setMessage(data);
      }
    });
  };

  const receiverOpen = useCallback((connection: DataConnection) => {
    connection.on('data', (res) => {
      const { type, data, sender }: Data = res ?? {};
      if (!sender) return;
      console.log({ type, data, sender });
      if (type === MSG_TYPE.REQ) {
        if (AUTO_ACCEPT || confirm(`Accept ${sender.nickName}'s Chat request`)) {
          connection.send({ type: MSG_TYPE.OK, data, sender: myInfoRef.current });
          const friend = friendsRef.current.find(({ id }) => id === sender?.id);
          if (!friend) {
            friends.unshift({ id: sender.id, nickName: sender.nickName });
          } else {
            friend.nickName = sender.nickName;
          }
          setFriends([...friends]);
          if (!chatsRef.current[sender.id]) {
            chatsRef.current[sender.id] = {
              connection,
              messages: [],
              id: sender.id,
              nickName: friend?.nickName,
              status: 1,
            };
          } else {
            chatsRef.current[sender.id].connection = connection;
            chatsRef.current[sender.id].nickName = sender.nickName;
            chatsRef.current[sender.id].status = 1;
          }
          setChats({ ...chatsRef.current });
          setActiveChat(sender.id);
        } else {
          connection.send({ type: MSG_TYPE.REJ, data, sender: myInfoRef.current });
        }
      }
      if (type === MSG_TYPE.MSG && sender && data) {
        setMessage(data);
      }
    });
  }, []);

  const connect = (id?: string) => {
    if (peer) {
      const friendId = id ?? inputRef.current?.value;
      if (friendId) {
        setLoading(true);
        const connection = peer.connect(friendId);
        connection?.on('open', () => {
          senderOpen(connection);
          connection.on('close', () => {
            if (chatsRef.current[friendId].status) {
              chatsRef.current[friendId] = { ...chatsRef.current[friendId], status: 0 };
              setChats({ ...chatsRef.current });
            }
          });
        });
      }
    }
  };

  const send = () => {
    const content = messageRef.current?.value?.trim();
    if (chatRef.current?.connection && content && myInfoRef.current) {
      const key = v4();
      const data = {
        key,
        content,
        senderId: myInfoRef.current.id,
        receiveId: chatRef.current.id,
        timestamp: Date.now(),
      };
      chatRef.current?.connection?.send({ type: MSG_TYPE.MSG, data, sender: myInfoRef.current });
      setMessage(data);
    }
  };

  const videoClose = () => {
    if (streamRef.current) {
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = undefined;
    }
    if (videoRef.current) {
      videoRef.current.style.display = 'none';
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (removeVideoRef.current) {
      removeVideoRef.current.srcObject = null;
    }
  };

  const videoOpen = (stream: MediaStream, remoteStream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.style.display = 'block';
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      streamRef.current = stream;
    }
    if (removeVideoRef.current) {
      removeVideoRef.current.srcObject = remoteStream;
    }
  };

  const video = (id?: string) => {
    if (!id) return;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        const call = peer.call(id, stream);
        call.on('stream', (remoteStream) => {
          videoOpen(stream, remoteStream);
        });
        call.on('close', () => {
          videoClose();
        });
      })
      .catch((error) => {
        console.error('Error accessing media devices.', error);
      });
  };

  useEffect(() => {
    peer = new Peer(myInfo?.id);
    peer.on('open', (id: string) => {
      const myInfo = myInfoRef.current ?? { id, nickName: getNickName() };
      setMyInfo(myInfo);
      localStorage.setItem(MY_INFO_CACHE_KEY, JSON.stringify(myInfo));
      peer?.on('connection', (connection) => {
        connection?.on('open', () => {
          receiverOpen(connection);
          connection.on('close', () => {
            let needSet = false;
            Object.values(chatsRef.current).forEach((chat) => {
              if (chat.connection === connection && chat.status) {
                chatsRef.current[chat.id] = { ...chatsRef.current[chat.id], status: 0 };
                needSet = true;
              }
            });
            needSet && setChats({ ...chatsRef.current });
          });
        });

        peer.on('disconnected', () => {
          let needSet = false;
          Object.values(chatsRef.current).forEach((chat) => {
            if (chat.connection === connection && chat.status) {
              chatsRef.current[chat.id] = { ...chatsRef.current[chat.id], status: 0 };
              needSet = true;
            }
          });
          needSet && setChats({ ...chatsRef.current });
          alert('Peer service is disconnected');
        });
      });
      peer.on('call', (call) => {
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then((stream) => {
            call.answer(stream);
            call.on('stream', (remoteStream) => {
              videoOpen(stream, remoteStream);
            });
            call.on('close', () => {
              videoClose();
            });
          })
          .catch((error) => {
            console.error('Error accessing media devices.', error);
          });
      });
      peer.on('close', () => {
        let needSet = false;
        Object.values(chatsRef.current).forEach((chat) => {
          if (chat.status) {
            chatsRef.current[chat.id] = { ...chatsRef.current[chat.id], status: 0 };
            needSet = true;
          }
        });
        needSet && setChats({ ...chatsRef.current });
        alert('Peer service is closed');
      });
    });
  }, []);

  useEffect(() => {
    const handle = () => {
      if (myInfoRef.current) {
        localStorage.setItem(
          getFriendsCacheKey(myInfoRef.current?.id),
          JSON.stringify(friendsRef.current),
        );
        Object.values(chatsRef.current).forEach((chat) => {
          chat.connection = undefined;
        });
        localStorage.setItem(
          getChatsCacheKey(myInfoRef.current?.id),
          JSON.stringify(chatsRef.current),
        );
      }
    };
    window.addEventListener('beforeunload', handle);
    return () => {
      return window.removeEventListener('beforeunload', handle);
    };
  });

  return (
    <div hidden={!myInfo?.id}>
      <div hidden={!!chat?.connection || loading}>
        <p>
          ID: {myInfo?.id} <br /> NickName: {myInfo?.nickName}
        </p>
        <p>
          {/* @ts-ignore */}
          <input ref={inputRef} placeholder={'Place input another id'}></input>
          <button onClick={() => connect()}>Add</button>
        </p>
        <ul>
          {friends?.map(({ id, nickName }) => {
            return (
              <a key={id} onClick={() => connect(id)}>
                {nickName}({id})
              </a>
            );
          })}
        </ul>
      </div>
      <div hidden={!chat?.connection}>
        <div>
          <button onClick={() => setActiveChat(undefined)}>Back</button>
          <h2>
            [{chat?.status ? 'Online' : chat?.status === 0 ? 'Offline' : ''}] {chat?.nickName}
            <small>({chat?.id})</small>
          </h2>
        </div>
        <div>
          {chat?.messages?.map(({ key, senderId, content }) => {
            return (
              <div key={key} style={{ textAlign: senderId === myInfo?.id ? 'right' : undefined }}>
                <div>
                  {senderId === myInfo?.id ? myInfo?.nickName : chat?.nickName}
                  <small>({senderId})</small>
                </div>
                <p>{content}</p>
              </div>
            );
          })}
        </div>
        {/* @ts-ignore */}
        <input ref={messageRef} placeholder={'Message'}></input>
        <button onClick={() => send()}>Send</button>{' '}
        <button onClick={() => video(chat?.id)}>Call</button>
      </div>
      {/* @ts-ignore */}
      <div ref={videoRef.current} style={{ display: 'none' }}>
        <button onClick={() => videoClose()}>Close</button>
        {/* @ts-ignore */}
        <video ref={localVideoRef}></video>
        {/* @ts-ignore */}
        <video ref={removeVideoRef}></video>
      </div>
    </div>
  );
}
