document.addEventListener('DOMContentLoaded', function() {
    // Inicializar gráficos
    initLeadsOverTimeChart();
    initAcquisitionChannelsChart();
    initActivityHeatmap();
    loadRecentActivities();
    loadRecentLeads();
    
    // Configurar filtro de data
    document.getElementById('timeRange').addEventListener('change', function() {
        updateDashboardData(this.value);
    });
    
    // Botões de alternar gráfico
    document.querySelectorAll('.chart-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-action-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const chartType = this.dataset.chart;
            toggleChartType(chartType);
        });
    });
});

function updateDashboardData(days) {
    // Simular atualização de dados com base no período selecionado
    console.log('Atualizando dashboard para os últimos', days, 'dias');
    
    // Atualizar métricas
    document.getElementById('newLeads').textContent = Math.floor(Math.random() * 200) + 50;
    document.getElementById('scheduledLeads').textContent = Math.floor(Math.random() * 150) + 30;
    
    // Atualizar gráficos
    initLeadsOverTimeChart();
    initAcquisitionChannelsChart();
}

function toggleChartType(chartType) {
    const chart = Chart.getChart('leadsOverTimeChart');
    if (chart) {
        if (chartType === 'leads') {
            chart.data.datasets[0].data = [15, 22, 18, 27, 23, 32, 25, 19, 31, 28, 24, 30];
            chart.data.datasets[0].label = 'Novos Leads';
            chart.update();
        } else if (chartType === 'conversions') {
            chart.data.datasets[0].data = [3, 5, 4, 7, 6, 8, 6, 5, 9, 7, 6, 8];
            chart.data.datasets[0].label = 'Conversões';
            chart.update();
        }
    }
}

function initLeadsOverTimeChart() {
    const ctx = document.getElementById('leadsOverTimeChart').getContext('2d');
    
    // Destruir gráfico existente se houver
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
            datasets: [{
                label: 'Novos Leads',
                data: [15, 22, 18, 27, 23, 32, 25, 19, 31, 28, 24, 30],
                borderColor: '#25D366',
                backgroundColor: 'rgba(37, 211, 102, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function initAcquisitionChannelsChart() {
    const ctx = document.getElementById('acquisitionChannelsChart').getContext('2d');
    
    // Destruir gráfico existente se houver
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['WhatsApp', 'Site', 'Instagram', 'Indicação', 'E-mail', 'Outros'],
            datasets: [{
                label: 'Leads por Canal',
                data: [45, 32, 28, 15, 12, 8],
                backgroundColor: [
                    '#25D366',
                    '#3498db',
                    '#e1306c',
                    '#9b59b6',
                    '#f39c12',
                    '#95a5a6'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function initActivityHeatmap() {
    const heatmap = document.getElementById('activityHeatmap');
    heatmap.innerHTML = '';
    
    // Adicionar dias da semana
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    days.forEach(day => {
        const dayLabel = document.createElement('div');
        dayLabel.style.gridColumn = '1';
        dayLabel.style.textAlign = 'right';
        dayLabel.style.paddingRight = '8px';
        dayLabel.style.fontSize = '12px';
        dayLabel.textContent = day;
        heatmap.appendChild(dayLabel);
    });
    
    // Gerar células do heatmap
    for (let hour = 0; hour < 24; hour++) {
        // Adicionar rótulo de hora
        const hourLabel = document.createElement('div');
        hourLabel.style.gridRow = '1';
        hourLabel.style.textAlign = 'center';
        hourLabel.style.fontSize = '10px';
        hourLabel.textContent = hour + 'h';
        heatmap.appendChild(hourLabel);
        
        // Adicionar células para cada dia
        for (let day = 0; day < 7; day++) {
            const activity = Math.floor(Math.random() * 10);
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.gridColumn = (hour + 2) + '';
            cell.style.gridRow = (day + 2) + '';
            
            // Cor baseada na atividade
            const intensity = activity / 10;
            if (activity === 0) {
                cell.style.backgroundColor = '#f5f5f5';
            } else {
                cell.style.backgroundColor = `rgba(37, 211, 102, ${intensity})`;
            }
            
            // Tooltip
            cell.dataset.tooltip = `${days[day]} ${hour}h - ${activity} atividades`;
            
            heatmap.appendChild(cell);
        }
    }
}

function loadRecentActivities() {
    const activities = [
        {
            icon: 'fa-comment-dots',
            title: 'Novo lead via WhatsApp: João Silva',
            time: '10 minutos atrás'
        },
        {
            icon: 'fa-calendar-check',
            title: 'Reunião agendada com Maria Souza',
            time: '2 horas atrás'
        },
        {
            icon: 'fa-check-circle',
            title: 'Lead convertido: Carlos Oliveira',
            time: 'Ontem, 15:30'
        },
        {
            icon: 'fa-envelope',
            title: 'E-mail enviado para Ana Santos',
            time: 'Ontem, 11:45'
        },
        {
            icon: 'fa-phone',
            title: 'Chamada perdida de (11) 9876-5432',
            time: 'Terça-feira, 09:20'
        }
    ];
    
    const container = document.getElementById('recentActivities');
    container.innerHTML = '';
    
    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <div class="activity-icon">
                <i class="fas ${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function loadRecentLeads() {
    const leads = [
        {
            name: 'João Silva',
            contact: '(11) 9876-5432 | joao@email.com',
            source: 'WhatsApp',
            status: 'Novo',
            lastInteraction: '10 min atrás'
        },
        {
            name: 'Maria Souza',
            contact: '(21) 9987-6543',
            source: 'Site',
            status: 'Agendado',
            lastInteraction: '2 horas atrás'
        },
        {
            name: 'Carlos Oliveira',
            contact: 'carlos@empresa.com',
            source: 'Indicação',
            status: 'Convertido',
            lastInteraction: 'Ontem'
        },
        {
            name: 'Ana Santos',
            contact: '(51) 9876-1234',
            source: 'Instagram',
            status: 'Novo',
            lastInteraction: 'Ontem'
        },
        {
            name: 'Pedro Costa',
            contact: '(81) 9988-7766 | pedro@exemplo.com',
            source: 'E-mail',
            status: 'Agendado',
            lastInteraction: '2 dias atrás'
        }
    ];
    
    const tbody = document.querySelector('#recentLeadsTable tbody');
    tbody.innerHTML = '';
    
    leads.forEach(lead => {
        const row = document.createElement('tr');
        
        let statusClass = '';
        if (lead.status === 'Novo') statusClass = 'status-new';
        if (lead.status === 'Agendado') statusClass = 'status-scheduled';
        if (lead.status === 'Convertido') statusClass = 'status-converted';
        
        row.innerHTML = `
            <td>${lead.name}</td>
            <td>${lead.contact}</td>
            <td>${lead.source}</td>
            <td><span class="status-badge ${statusClass}">${lead.status}</span></td>
            <td>${lead.lastInteraction}</td>
            <td>
                <div class="table-actions">
                    <button title="Editar"><i class="fas fa-edit"></i></button>
                    <button title="Conversar"><i class="fas fa-comment"></i></button>
                    <button title="Histórico"><i class="fas fa-history"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}