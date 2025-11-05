import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MessageList } from '../components/MessageList';
import { MessageInput } from '../components/MessageInput';
import { apiClient, wsService } from '../services/api';
import { appState$, actions } from '../store/appState';

interface ChatScreenProps {
  route: any;
  navigation: any;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ route, navigation }) => {
  const { channelID, channelName } = route.params;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Definir header
    navigation.setOptions({
      title: channelName,
    });

    // Carregar mensagens
    const loadMessages = async () => {
      try {
        setLoading(true);
        const messages = await apiClient.getMessages(channelID);
        // TODO: Salvar mensagens no estado
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    // TODO: Se conectar ao WebSocket para mensagens em tempo real
  }, [channelID, channelName, navigation]);

  const handleSendMessage = async (content: string) => {
    try {
      await apiClient.sendMessage(channelID, content);
      // TODO: Mensagem será recebida via WebSocket
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MessageList channelID={channelID} />
      <MessageInput onSendMessage={handleSendMessage} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
