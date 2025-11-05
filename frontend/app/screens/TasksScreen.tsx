import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { apiClient } from '../services/api';

interface TasksScreenProps {
  route: any;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({ route }) => {
  const { channelID } = route.params;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        const data = await apiClient.getTasks(channelID);
        setTasks(data);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [channelID]);

  const handleTaskStatusChange = async (taskID: string, newStatus: string) => {
    try {
      await apiClient.updateTask(channelID, taskID, { status: newStatus });
      setTasks(tasks.map(t => 
        t.id === taskID ? { ...t, status: newStatus } : t
      ));
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const renderTaskItem = ({ item }: any) => (
    <View style={styles.taskItem}>
      <View style={styles.taskContent}>
        <Text style={styles.taskTitle}>{item.title}</Text>
        <Text style={styles.taskStatus}>{item.status}</Text>
      </View>
      <TouchableOpacity
        style={styles.statusButton}
        onPress={() => {
          const nextStatus = 
            item.status === 'todo' ? 'in_progress' :
            item.status === 'in_progress' ? 'done' :
            'todo';
          handleTaskStatusChange(item.id, nextStatus);
        }}
      >
        <Text style={styles.statusButtonText}>→</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
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
  listContent: {
    padding: 12,
    gap: 12,
  },
  taskItem: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  taskStatus: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize',
  },
  statusButton: {
    padding: 8,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  statusButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
