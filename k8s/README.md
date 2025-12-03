# Deployment Guide para o Nexus no Kubernetes

## Pré-requisitos

### 1. Cluster Kubernetes
- Kubernetes 1.25+
- kubectl configurado
- Ingress Controller (NGINX recomendado)
- cert-manager para certificados SSL
- StorageClass configurado

### 2. Ferramentas necessárias
```bash
# Instalar kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# Instalar Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### 3. Preparar o ambiente
```bash
# Clonar o repositório
git clone <repo-url>
cd nexus

# Criar namespace
kubectl apply -f k8s/00-namespace-config.yaml
```

## Deploy Step-by-Step

### Passo 1: Configurar Secrets e ConfigMaps
```bash
# Aplicar configurações base
kubectl apply -f k8s/00-namespace-config.yaml

# Verificar se os secrets foram criados
kubectl get secrets -n nexus
```

### Passo 2: Deploy da infraestrutura (Cassandra, NATS, Redis)
```bash
# Deploy Cassandra
kubectl apply -f k8s/01-cassandra.yaml

# Aguardar Cassandra ficar ready
kubectl wait --for=condition=ready pod -l app=cassandra -n nexus --timeout=300s

# Deploy NATS e Redis
kubectl apply -f k8s/02-nats-redis.yaml

# Verificar status
kubectl get pods -n nexus
```

### Passo 3: Inicializar banco de dados
```bash
# Conectar ao Cassandra e executar migrations
kubectl exec -it cassandra-0 -n nexus -- cqlsh

# No cqlsh, executar:
# SOURCE '/opt/cassandra/scripts/init.cql';
# SOURCE '/opt/cassandra/scripts/migration.cql';
# EXIT;
```

### Passo 4: Deploy das aplicações
```bash
# Deploy API e WebSocket
kubectl apply -f k8s/03-api-websocket.yaml

# Verificar status dos pods
kubectl get pods -n nexus -w
```

### Passo 5: Configurar Ingress e Autoscaling
```bash
# Instalar NGINX Ingress Controller (se não instalado)
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace

# Instalar cert-manager (para SSL)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Deploy Ingress e HPA
kubectl apply -f k8s/04-ingress-autoscaling.yaml
```

### Passo 6: Deploy do Monitoring
```bash
# Deploy Prometheus e Grafana
kubectl apply -f k8s/05-monitoring.yaml

# Aguardar deployment
kubectl wait --for=condition=available deployment/prometheus -n nexus --timeout=300s
kubectl wait --for=condition=available deployment/grafana -n nexus --timeout=300s
```

## Configuração DNS

### Atualizar domínios no Ingress
```bash
# Editar o arquivo de Ingress
kubectl edit ingress nexus-ingress -n nexus

# Substituir:
# - nexus.yourdomain.com
# - api.nexus.yourdomain.com
# Pelos domínios reais
```

### Configurar DNS
```bash
# Obter IP do Load Balancer
kubectl get service ingress-nginx-controller -n ingress-nginx

# Configurar registros DNS:
# A record: nexus.yourdomain.com -> EXTERNAL-IP
# A record: api.nexus.yourdomain.com -> EXTERNAL-IP
```

## Verificação e Troubleshooting

### Comandos úteis de verificação
```bash
# Status geral
kubectl get all -n nexus

# Logs das aplicações
kubectl logs -f deployment/nexus-api -n nexus
kubectl logs -f deployment/nexus-websocket -n nexus

# Eventos do namespace
kubectl get events -n nexus --sort-by='.lastTimestamp'

# Verificar recursos
kubectl top pods -n nexus
kubectl top nodes

# Status do HPA
kubectl get hpa -n nexus
```

### Troubleshooting comum

#### 1. Pods não iniciam
```bash
# Verificar recursos disponíveis
kubectl describe nodes

# Verificar eventos do pod
kubectl describe pod <pod-name> -n nexus

# Verificar limites de recursos
kubectl get limitrange -n nexus
```

#### 2. Problemas de conectividade
```bash
# Testar conectividade interna
kubectl exec -it <pod-name> -n nexus -- nslookup cassandra.nexus.svc.cluster.local

# Verificar network policies
kubectl get networkpolicy -n nexus
```

#### 3. Problemas de storage
```bash
# Verificar PVCs
kubectl get pvc -n nexus

# Verificar StorageClass
kubectl get storageclass
```

## Monitoramento e Alertas

### Acessar Grafana
```bash
# Port forward para acessar localmente
kubectl port-forward service/grafana 3000:3000 -n nexus

# Abrir http://localhost:3000
# Usuário: admin
# Senha: definida no Secret
```

### Dashboards recomendados
- Kubernetes Cluster Monitoring
- Go Application Metrics
- Cassandra Monitoring
- Redis Monitoring
- NATS Monitoring

### Alertas importantes
- High error rate (>10%)
- High CPU usage (>80%)
- High memory usage (>85%)
- Pod crash looping
- Database connection failures

## Backup e Disaster Recovery

### Backup do Cassandra
```bash
# Script de backup automático
kubectl create job cassandra-backup-$(date +%Y%m%d) -n nexus --image=cassandra:4.1 -- \
  nodetool snapshot -t backup-$(date +%Y%m%d) nexus_keyspace
```

### Backup dos PVCs
```bash
# Usando Velero para backup completo
velero backup create nexus-backup-$(date +%Y%m%d) --include-namespaces nexus
```

## Scaling e Performance

### Scaling manual
```bash
# Escalar API
kubectl scale deployment nexus-api --replicas=5 -n nexus

# Escalar WebSocket
kubectl scale deployment nexus-websocket --replicas=8 -n nexus
```

### Configurar VPA (Vertical Pod Autoscaler)
```bash
# Instalar VPA
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh
```

## Atualizações e Rollbacks

### Rolling update
```bash
# Atualizar imagem da API
kubectl set image deployment/nexus-api nexus-api=nexus-api:v2.0.0 -n nexus

# Acompanhar rollout
kubectl rollout status deployment/nexus-api -n nexus
```

### Rollback
```bash
# Ver histórico
kubectl rollout history deployment/nexus-api -n nexus

# Fazer rollback
kubectl rollout undo deployment/nexus-api -n nexus
```

## Security Checklist

- [ ] Secrets configurados corretamente
- [ ] Network Policies aplicadas
- [ ] RBAC configurado
- [ ] Pod Security Standards configurados
- [ ] Imagens escaneadas por vulnerabilidades
- [ ] Certificados SSL configurados
- [ ] Rate limiting ativo
- [ ] Logs de auditoria habilitados

## Performance Tuning

### Otimizações recomendadas
- Ajustar resource requests/limits baseado no monitoring
- Configurar node affinity para distribuição
- Usar PodDisruptionBudgets
- Configurar topology spread constraints
- Implementar circuit breakers
- Otimizar queries Cassandra
- Configurar connection pooling adequado

## Compliance e Governança

### Políticas recomendadas
```yaml
# Pod Security Policy example
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: nexus-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
```
