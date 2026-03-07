using System;
using System.Reflection;

class Program
{
    static void Main()
    {
        Type t = typeof(YahooQuotesApi.YahooQuotesBuilder);
        foreach (var m in t.GetMethods())
        {
            Console.WriteLine(m.Name);
            foreach(var p in m.GetParameters())
            {
                Console.WriteLine("    " + p.ParameterType.Name + " " + p.Name);
            }
        }
    }
}
