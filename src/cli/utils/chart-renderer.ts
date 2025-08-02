import chalk from 'chalk';
import { formatCurrency, formatPercentage } from './formatters';

export interface ChartData {
  date: string;
  value: number;
  return: number;
}

export class ChartRenderer {
  private readonly CHART_WIDTH = 60;
  private readonly CHART_HEIGHT = 15;

  /**
   * Render a performance chart using ASCII characters
   */
  renderPerformanceChart(data: ChartData[], timeRange: string): void {
    if (data.length === 0) {
      console.log(chalk.gray('No data available for chart'));
      return;
    }

    console.log(chalk.white(`\n📊 Performance Chart (${timeRange}):`));
    console.log(chalk.gray('─'.repeat(this.CHART_WIDTH + 10)));

    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;

    if (range === 0) {
      console.log(chalk.gray('No variation in data to display'));
      return;
    }

    // Create chart grid
    const chart: string[][] = Array(this.CHART_HEIGHT)
      .fill(null)
      .map(() => Array(this.CHART_WIDTH).fill(' '));

    // Plot data points
    data.forEach((point, index) => {
      const x = Math.floor((index / (data.length - 1)) * (this.CHART_WIDTH - 1));
      const normalizedValue = (point.value - minValue) / range;
      const y = Math.floor((1 - normalizedValue) * (this.CHART_HEIGHT - 1));
      
      if (x >= 0 && x < this.CHART_WIDTH && y >= 0 && y < this.CHART_HEIGHT && chart[y] && chart[y][x] !== undefined) {
        chart[y][x] = '●';
      }
    });

    // Draw connecting lines (simple approximation)
    for (let i = 0; i < data.length - 1; i++) {
      const point1 = data[i];
      const point2 = data[i + 1];
      
      if (!point1 || !point2) continue;
      
      const x1 = Math.floor((i / (data.length - 1)) * (this.CHART_WIDTH - 1));
      const x2 = Math.floor(((i + 1) / (data.length - 1)) * (this.CHART_WIDTH - 1));
      
      const normalizedValue1 = (point1.value - minValue) / range;
      const normalizedValue2 = (point2.value - minValue) / range;
      
      const y1 = Math.floor((1 - normalizedValue1) * (this.CHART_HEIGHT - 1));
      const y2 = Math.floor((1 - normalizedValue2) * (this.CHART_HEIGHT - 1));

      // Simple line drawing between points
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let step = 0; step <= steps; step++) {
        const x = Math.round(x1 + (x2 - x1) * (step / steps));
        const y = Math.round(y1 + (y2 - y1) * (step / steps));
        
        if (x >= 0 && x < this.CHART_WIDTH && y >= 0 && y < this.CHART_HEIGHT && chart[y] && chart[y][x] === ' ') {
          chart[y][x] = '·';
        }
      }
    }

    // Display chart with Y-axis labels
    for (let y = 0; y < this.CHART_HEIGHT; y++) {
      const valueAtY = maxValue - (y / (this.CHART_HEIGHT - 1)) * range;
      const yLabel = formatCurrency(valueAtY).padStart(8);
      
      const chartRow = chart[y];
      if (chartRow) {
        const line = chartRow.join('');
        const coloredLine = this.colorizeChartLine(line, y, this.CHART_HEIGHT);
        console.log(`${chalk.gray(yLabel)} │ ${coloredLine}`);
      }
    }

    // X-axis
    console.log(`${' '.repeat(9)}└${'─'.repeat(this.CHART_WIDTH)}`);
    
    // X-axis labels
    const firstPoint = data[0];
    const lastPoint = data[data.length - 1];
    
    if (firstPoint && lastPoint) {
      const firstDate = new Date(firstPoint.date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      const lastDate = new Date(lastPoint.date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      console.log(`${' '.repeat(11)}${firstDate}${' '.repeat(this.CHART_WIDTH - firstDate.length - lastDate.length)}${lastDate}`);
    }

    // Chart summary
    const firstValue = firstPoint?.value || 0;
    const lastValue = lastPoint?.value || 0;
    const totalReturn = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;
    const returnColor = totalReturn >= 0 ? 'green' : 'red';
    
    console.log(chalk.gray('\n' + '─'.repeat(this.CHART_WIDTH + 10)));
    console.log(`Period Return: ${chalk[returnColor](formatPercentage(totalReturn))}`);
    console.log(`Range: ${formatCurrency(minValue)} - ${formatCurrency(maxValue)}`);
  }

  /**
   * Render a simple bar chart
   */
  renderBarChart(data: Array<{ label: string; value: number; color?: string }>, title: string): void {
    console.log(chalk.white(`\n📊 ${title}:`));
    console.log(chalk.gray('─'.repeat(50)));

    if (data.length === 0) {
      console.log(chalk.gray('No data to display'));
      return;
    }

    const maxValue = Math.max(...data.map(d => d.value));
    const maxBarLength = 30;

    data.forEach(item => {
      const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
      const barLength = Math.round((percentage / 100) * maxBarLength);
      const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
      
      const color: string = item.color || 'cyan';
      const formattedValue = typeof item.value === 'number' && item.value < 1 
        ? formatPercentage(item.value * 100)
        : formatCurrency(item.value);

      const coloredBar = this.getColoredText(bar, color);
      console.log(
        `${item.label.padEnd(15)} ${coloredBar} ${formattedValue.padStart(10)} (${formatPercentage(percentage)})`
      );
    });
  }

  /**
   * Render a simple pie chart using text
   */
  renderPieChart(data: Array<{ label: string; value: number; percentage: number }>, title: string): void {
    console.log(chalk.white(`\n🥧 ${title}:`));
    console.log(chalk.gray('─'.repeat(50)));

    if (data.length === 0) {
      console.log(chalk.gray('No data to display'));
      return;
    }

    // Sort by percentage descending
    const sortedData = [...data].sort((a, b) => b.percentage - a.percentage);

    sortedData.forEach((item, index) => {
      const colors = ['cyan', 'green', 'yellow', 'blue', 'magenta', 'red'];
      const color: string = colors[index % colors.length] || 'cyan';
      
      const barLength = Math.round(item.percentage / 2); // Scale to fit console
      const bar = '█'.repeat(barLength);
      
      const coloredDot = this.getColoredText('●', color);
      const coloredBar = this.getColoredText(bar, color);
      console.log(
        `${coloredDot} ${item.label.padEnd(20)} ${coloredBar} ${formatPercentage(item.percentage).padStart(6)} ${formatCurrency(item.value).padStart(12)}`
      );
    });
  }

  /**
   * Render a sparkline (mini chart)
   */
  renderSparkline(values: number[], label?: string): string {
    if (values.length === 0) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) return '─'.repeat(values.length);

    const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    
    const sparkline = values.map(value => {
      const normalized = (value - min) / range;
      const index = Math.floor(normalized * (sparkChars.length - 1));
      return sparkChars[Math.max(0, Math.min(sparkChars.length - 1, index))];
    }).join('');

    return label ? `${label}: ${sparkline}` : sparkline;
  }

  /**
   * Colorize chart line based on position (gradient effect)
   */
  private colorizeChartLine(line: string, y: number, totalHeight: number): string {
    const position = y / (totalHeight - 1); // 0 = top, 1 = bottom
    
    // Color gradient from green (top) to red (bottom)
    let color: keyof typeof chalk;
    if (position < 0.33) {
      color = 'green';
    } else if (position < 0.66) {
      color = 'yellow';
    } else {
      color = 'red';
    }

    return line.split('').map(char => {
      if (char === '●') return chalk[color](char);
      if (char === '·') return chalk.gray(char);
      return char;
    }).join('');
  }

  /**
   * Create a progress bar
   */
  static createProgressBar(current: number, total: number, width: number = 20): string {
    const percentage = Math.min(100, (current / total) * 100);
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${formatPercentage(percentage)}`;
  }

  /**
   * Get colored text with safe color access
   */
  private getColoredText(text: string, color: string): string {
    switch (color) {
      case 'red': return chalk.red(text);
      case 'green': return chalk.green(text);
      case 'yellow': return chalk.yellow(text);
      case 'blue': return chalk.blue(text);
      case 'magenta': return chalk.magenta(text);
      case 'cyan': return chalk.cyan(text);
      case 'white': return chalk.white(text);
      case 'gray': return chalk.gray(text);
      default: return chalk.white(text);
    }
  }
} 