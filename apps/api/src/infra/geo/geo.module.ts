import { Module } from '@nestjs/common';

import { AmapClient } from './amap.client';
import { WeatherClient } from './weather.client';

@Module({
  providers: [AmapClient, WeatherClient],
  exports: [AmapClient, WeatherClient],
})
export class GeoModule {}
