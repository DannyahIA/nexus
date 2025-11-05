import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useChannelMessages } from '../hooks/useAppState';

interface MessageItemProps {
  id: string;
  authorID: string;
  content: string;
  timestamp: number;
  authorName?: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  authorName,
  content,
  timestamp,
}) => {
  const time = new Date(timestamp).toLocaleTimeString();

  return (
    <View style={styles.container}>
      <Text style={styles.author}>{authorName}</Text>
      <Text style={styles.content}>{content}</Text>
      <Text style={styles.timestamp}>{time}</Text>
    </View>
  );
};

interface MessageListProps {
  channelID: string;
  onReplyTo?: (message: MessageItemProps) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ channelID, onReplyTo }) => {
  const messages = useChannelMessages(channelID);

  return (
    <FlatList
      data={messages}
      renderItem={({ item }) => (
        <TouchableOpacity onLongPress={() => onReplyTo?.(item)}>
          <MessageItem
            {...item}
            authorName={item.authorID} // TODO: Mapear para nome real
          />
        </TouchableOpacity>
      )}
      keyExtractor={(item) => item.id}
      inverted
      style={styles.list}
      contentContainerStyle={styles.listContent}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  author: {
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  content: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
});
