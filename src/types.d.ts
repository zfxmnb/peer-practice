interface Message {
    key: string,
    senderId: string,
    receiveId: string,
    content: string,
    timestamp: number
}

interface Person {
    id: string,
    nickName?: string;
}