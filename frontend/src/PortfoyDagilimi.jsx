// Pasta grafiği ortasında toplam değer, altında her hissenin payı ile gösterilir.
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { pastaRengi, tl } from './portfoy';

const kisaTutar = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

const PortfoyDagilimi = ({ veri }) => {
  const toplam = veri.reduce((t, item) => t + item.value, 0);

  return (
    <section className="min-w-0 bg-black rounded-xl border border-white p-5">
      <h4 className="text-slate-300 font-medium mb-3">Portföy Dağılımı</h4>
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={veri}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={95}
              paddingAngle={veri.length > 1 ? Math.min(5, 120 / veri.length) : 0}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {veri.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={pastaRengi(index)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => tl(value)}
              contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff', color: '#f8fafc', borderRadius: '0.5rem' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400">Toplam</span>
          <span className="font-bold text-white">{kisaTutar.format(toplam)} ₺</span>
        </div>
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto text-sm">
        {veri.map((item, index) => (
          <div key={item.name} className="flex items-center gap-3 py-2 border-t border-white/20">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pastaRengi(index) }} />
            {item.name}
            <span className="ml-auto mr-3 text-slate-300">%{((item.value / toplam) * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PortfoyDagilimi;
